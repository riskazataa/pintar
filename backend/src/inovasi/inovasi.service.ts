import { hasilPenilaian, statusPenilaian } from './hasil-penilaian';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StatusInovasi } from '@prisma/client';
import { CreateInovasiDto } from './dto/create-inovasi.dto';
import { UpdateInovasiDto } from './dto/update-inovasi.dto';
import { QueryInovasiDto } from './dto/query-inovasi.dto';
import { UpdateAssessmentPenilaiDto } from './dto/update-assessment-penilai.dto';
import { UpdateAssessmentCellsDto } from './dto/update-assessment-cells.dto';
import { UpdateAssessmentAnswersDto } from './dto/update-assessment-answers.dto';
import { SignInovasiDto } from './dto/sign-inovasi.dto';
import { SaveInovasiDraftDto } from './dto/save-inovasi-draft.dto';
import { loadTemplateConfig } from '../assessment/template-config';
import { composeStage2Answers } from './stage2-assessment';
import { orderFinalSignatureGroups } from './final-signature-order';
import { baCriteriaStats } from './ba-criteria-stats';

const KRITERIA_INOVASI_OPTIONS = [
  'Pembaharuan / Orisinil / Modifikasi',
  'Memudahkan pelayanan',
  'Mempercepat pelayanan',
  'Disebarluaskan',
  'Bermanfaat',
  'Spesifik',
  'Berkelanjutan',
  'Solusi/upaya pemecahan masalah',
  'Dapat diaplikasikan di Internal dan atau eksternal',
  'Percontohan nasional',
];

@Injectable()
export class InovasiService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertSubmissionIsUnlocked() {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { id: 1 },
      select: { submissions_locked: true },
    });
    if (setting?.submissions_locked) {
      throw new ForbiddenException('Penambahan usulan sedang dikunci oleh Super Admin.');
    }
  }

  private get includeConfig() {
    return {
      satker: { select: { id: true, nama_satker: true } },
      user: { select: { id: true, nama_lengkap: true } },
      penilai: { select: { id: true, nama_lengkap: true } },
      penilai_tahap2: { select: { id: true, nama_lengkap: true } },
      usulan_signatures: {
        include: {
          user: { select: { id: true, nama_lengkap: true } },
        },
      },
      assessment_answers: {
        include: {
          question: { select: { id: true, pertanyaan: true, is_header: true, satker_lock_mode: true, question_title_override: true, column_titles: true, parent_id: true, tahap: true, urutan: true } },
        },
      },
    } satisfies Prisma.InovasiInclude;
  }

  async findAll(
    query: QueryInovasiDto,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const sortOrder = query.sort_order ?? 'desc';
    const { search, satker_id, status, start_date, end_date, assignedToMe, assignedToMeAny, tahun } =
      query;

    const where: Prisma.InovasiWhereInput = {};
    if (tahun) {
      const periodStart = new Date(Date.UTC(tahun, 0, 1));
      const periodEnd = new Date(Date.UTC(tahun + 1, 0, 1));
      where.AND = [{
        OR: [
          {
            status: StatusInovasi.DRAFT,
            created_at: { gte: periodStart, lt: periodEnd },
          },
          {
            status: { not: StatusInovasi.DRAFT },
            submitted_at: { gte: periodStart, lt: periodEnd },
          },
        ],
      }];
    }

    if (user.role !== 'UNIT' || query.hasil) where.status = { not: StatusInovasi.DRAFT };

    if (user.role === 'UNIT' && user.satker_id) {
      where.satker_id = user.satker_id;
    } else if (
      ['SUPER_ADMIN', 'REVIEWER'].includes(
        user.role,
      ) &&
      satker_id
    ) {
      where.satker_id = satker_id;
    }

    if (query.tahap === 2) where.status = StatusInovasi.SELESAI_EVALUASI;
    if (assignedToMeAny && user.sub) {
      const existingConditions = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : [];
      where.AND = [
        ...existingConditions,
        {
          OR: [
            { penilai: { some: { id: user.sub } } },
            {
              AND: [
                { status: StatusInovasi.SELESAI_EVALUASI },
                { penilai_tahap2: { some: { id: user.sub } } },
              ],
            },
          ],
        },
      ];
    } else if (assignedToMe && user.sub) {
      if (query.tahap === 2) where.penilai_tahap2 = { some: { id: user.sub } };
      else where.penilai = { some: { id: user.sub } };
    }

    if (status) {
      if (status === StatusInovasi.DRAFT && user.role !== 'UNIT') where.id = -1;
      else if (query.tahap === 2) where.status_tahap2 = status;
      else where.status = status;
    }

    if (search) {
      const searchConditions: Prisma.InovasiWhereInput[] = [
        { judul: { contains: search, mode: 'insensitive' } },
        { deskripsi_inovasi: { contains: search, mode: 'insensitive' } },
        { pic_nama: { contains: search, mode: 'insensitive' } },
        { pic_telp: { contains: search, mode: 'insensitive' } },
        { jenis_inovasi: { contains: search, mode: 'insensitive' } },
        { jenis_inovasi_lainnya: { contains: search, mode: 'insensitive' } },
        { link_data_dukung: { contains: search, mode: 'insensitive' } },
        { kriteria_inovasi: { has: search } },
        { satker: { is: { nama_satker: { contains: search, mode: 'insensitive' } } } },
        { user: { is: { nama_lengkap: { contains: search, mode: 'insensitive' } } } },
        { user: { is: { email: { contains: search, mode: 'insensitive' } } } },
      ];
      if (/^\d+$/.test(search)) {
        searchConditions.push({ tahun: Number(search) });
      }
      where.OR = searchConditions;
    }

    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) {
        where.created_at.gte = new Date(start_date);
      }
      if (end_date) {
        const inclusiveEndDate = new Date(`${end_date}T00:00:00.000Z`);
        inclusiveEndDate.setUTCDate(inclusiveEndDate.getUTCDate() + 1);
        where.created_at.lt = inclusiveEndDate;
      }
    }

    let total: number;
    let data: any[];
    if (query.hasil) {
      const candidates = await this.prisma.inovasi.findMany({
        where,
        select: {
          id: true,
          status: true,
          status_tahap2: true,
          penilai: { select: { id: true } },
          penilai_tahap2: { select: { id: true } },
          usulan_signatures: { select: { user_id: true, tahap: true, keputusan: true } },
        },
        orderBy: { created_at: sortOrder },
      });
      const matchingIds = candidates
        .filter((item) => statusPenilaian(
          query.tahap === 2 ? item.status_tahap2 : item.status,
          query.tahap === 2 ? item.penilai_tahap2 : item.penilai,
          item.usulan_signatures,
          query.tahap ?? 1,
        ) === query.hasil)
        .map((item) => item.id);
      total = matchingIds.length;
      const pageIds = limit === 0 ? matchingIds : matchingIds.slice((page - 1) * limit, page * limit);
      data = pageIds.length ? await this.prisma.inovasi.findMany({
        where: { ...where, id: { in: pageIds } },
        include: this.includeConfig,
        orderBy: { created_at: sortOrder },
      }) : [];
    } else {
      [total, data] = await Promise.all([
        this.prisma.inovasi.count({ where }),
        this.prisma.inovasi.findMany({
          where,
          include: this.includeConfig,
          orderBy: { created_at: sortOrder },
          ...(limit > 0 ? { skip: (page - 1) * limit, take: limit } : {}),
        }),
      ]);
    }

    return {
      data: data.map((item) => ({
        ...item,
        hasil_penilaian: hasilPenilaian(query.tahap === 2 ? item.penilai_tahap2 : item.penilai, item.usulan_signatures, query.tahap ?? 1),
        hasil_penilaian_tahap1: hasilPenilaian(item.penilai, item.usulan_signatures, 1),
        hasil_penilaian_tahap2: hasilPenilaian(item.penilai_tahap2, item.usulan_signatures, 2),
        ...(query.tahap === 2 ? { status: item.status_tahap2, penilai: item.penilai_tahap2 } : {}),
      })),
      meta: {
        total,
        page,
        limit,
        total_pages: limit === 0 ? (total > 0 ? 1 : 0) : Math.ceil(total / limit),
      },
    };
  }

  private async getStage1Answers(answers: any[], includeReviewer: boolean) {
    const satkerAnswers = answers.filter((answer) => answer.tahap === 1 && (answer.source ?? 'SATKER') === 'SATKER');
    const { columns } = await loadTemplateConfig(this.prisma, 1);
    if (!includeReviewer) return this.filterAnswersByOwner(satkerAnswers, columns, 'SATKER');

    const reviewerAnswers = answers.filter((answer) => answer.tahap === 1 && answer.source === 'PENILAI');
    const reviewerByQuestion = new Map<number, any>();
    reviewerAnswers.forEach((answer) => reviewerByQuestion.set(answer.question_id, answer));
    const satkerQuestionIds = new Set(satkerAnswers.map((answer) => answer.question_id));
    return [
      ...satkerAnswers.map((answer) => {
        const reviewerAnswer = reviewerByQuestion.get(answer.question_id);
        if (!reviewerAnswer) return this.filterAnswersByOwner([answer], columns, 'SATKER')[0];
        const satkerValues = answer.custom_values && typeof answer.custom_values === 'object' ? answer.custom_values : {};
        const reviewerValues = reviewerAnswer.custom_values && typeof reviewerAnswer.custom_values === 'object' ? reviewerAnswer.custom_values : {};
        const customValues: Record<string, unknown> = {
          ...satkerValues,
          ...reviewerValues,
        };
        const legacyValue = (key: 'jawaban_boolean' | 'catatan_string' | 'link') => {
          const columnOwner = columns.find((item) => item.key === key)?.owner ?? 'BOTH';
          const satkerHasCustomValue = Object.prototype.hasOwnProperty.call(satkerValues, key);
          const reviewerHasCustomValue = Object.prototype.hasOwnProperty.call(reviewerValues, key);
          if (columnOwner === 'SATKER') return satkerHasCustomValue ? satkerValues[key] : answer[key];
          if (columnOwner === 'REVIEWER') return reviewerHasCustomValue ? reviewerValues[key] : reviewerAnswer[key];
          if (reviewerHasCustomValue) return reviewerValues[key];
          if (key === 'jawaban_boolean') {
            // Reviewer answer rows may be created just to save another column and default this
            // legacy field to false. Only an explicit custom value should override the Satker checkbox.
            if (reviewerAnswer[key] === true) return true;
            return satkerHasCustomValue ? satkerValues[key] : answer[key];
          }
          if (reviewerAnswer[key] !== undefined && reviewerAnswer[key] !== null) return reviewerAnswer[key];
          return satkerHasCustomValue ? satkerValues[key] : answer[key];
        };
        for (const column of columns) {
          const owner = column.owner ?? 'BOTH';
          if (column.key === 'jawaban_boolean' || column.key === 'catatan_string' || column.key === 'link') {
            const value = legacyValue(column.key);
            if (value !== undefined) customValues[column.key] = value;
            else delete customValues[column.key];
            continue;
          }
          const hasReviewerValue = Object.prototype.hasOwnProperty.call(reviewerValues, column.key);
          const sourceValues = owner === 'SATKER' ? satkerValues : owner === 'REVIEWER' || hasReviewerValue ? reviewerValues : satkerValues;
          if (Object.prototype.hasOwnProperty.call(sourceValues, column.key)) customValues[column.key] = sourceValues[column.key];
          else delete customValues[column.key];
        }
        const merged: any = { ...answer, ...reviewerAnswer, question: reviewerAnswer.question ?? answer.question, custom_values: customValues };
        merged.jawaban_boolean = legacyValue('jawaban_boolean');
        merged.catatan_string = legacyValue('catatan_string');
        merged.link = legacyValue('link');
        return merged;
      }),
      ...this.filterAnswersByOwner(
        reviewerAnswers.filter((answer) => !satkerQuestionIds.has(answer.question_id)),
        columns,
        'PENILAI',
      ),
    ];
  }

  private filterAnswersByOwner<T extends { custom_values?: any; jawaban_boolean?: boolean; catatan_string?: string | null; link?: string | null }>(
    answers: T[],
    columns: { key: string; owner?: 'BOTH' | 'SATKER' | 'REVIEWER' }[],
    source: 'SATKER' | 'PENILAI',
  ): T[] {
    return answers.map((answer) => {
      const values = answer.custom_values && typeof answer.custom_values === 'object' && !Array.isArray(answer.custom_values)
        ? answer.custom_values as Record<string, unknown>
        : {};
      const custom_values: Record<string, unknown> = {};
      for (const column of columns) {
        const owner = column.owner ?? 'BOTH';
        if ((owner === 'BOTH' || (source === 'SATKER' ? owner === 'SATKER' : owner === 'REVIEWER'))
          && Object.prototype.hasOwnProperty.call(values, column.key)) {
          custom_values[column.key] = values[column.key];
        }
      }
      const internalKeys = source === 'SATKER' ? ['__rincian'] : ['__kesimpulan', '__kesimpulan_catatan'];
      for (const key of internalKeys) if (Object.prototype.hasOwnProperty.call(values, key)) custom_values[key] = values[key];
      const mayEditLegacy = (key: 'jawaban_boolean' | 'catatan_string' | 'link') => {
        const owner = columns.find((column) => column.key === key)?.owner ?? 'BOTH';
        return owner === 'BOTH' || (source === 'SATKER' ? owner === 'SATKER' : owner === 'REVIEWER');
      };
      return {
        ...answer,
        jawaban_boolean: mayEditLegacy('jawaban_boolean') ? answer.jawaban_boolean : false,
        catatan_string: mayEditLegacy('catatan_string') ? answer.catatan_string : null,
        link: mayEditLegacy('link') ? answer.link : null,
        custom_values,
      };
    });
  }

  private orderAssessmentAnswers(answers: any[]) {
    return [...answers].sort((left, right) => {
      const leftQuestion = left.question ?? {};
      const rightQuestion = right.question ?? {};
      return (leftQuestion.tahap ?? left.tahap ?? 1) - (rightQuestion.tahap ?? right.tahap ?? 1)
        || (leftQuestion.urutan ?? Number.MAX_SAFE_INTEGER) - (rightQuestion.urutan ?? Number.MAX_SAFE_INTEGER)
        || leftQuestion.id - rightQuestion.id;
    });
  }

  async findOne(
    id: number,
    tahap = 1,
    user?: { role?: string },
    view?: 'self-assessment' | 'evaluation',
  ) {
    this.validateTahap(tahap);
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id },
      include: {
        ...this.includeConfig,
        revision_logs: {
          select: {
            id: true,
            catatan_perbaikan: true,
            requested_at: true,
            resubmitted_at: true,
            changes: true,
            requested_by: { select: { id: true, nama_lengkap: true } },
            resubmitted_by: { select: { id: true, nama_lengkap: true } },
          },
          orderBy: { requested_at: 'desc' },
        },
      },
    });

    if (!inovasi) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    if (tahap === 2) {
      if (inovasi.status !== StatusInovasi.SELESAI_EVALUASI) throw new BadRequestException('Tahap 1 belum selesai');
      const signatures = inovasi.usulan_signatures.filter((s) => s.tahap === 2);
      const saved = inovasi.assessment_answers.filter((a) => a.tahap === 2 && a.source === 'PENILAI');
      const questions = signatures.length
        ? saved.filter((answer) => answer.question.tahap === 2).map((answer) => answer.question)
        : await this.prisma.assessmentQuestion.findMany({ where: { tahap: 2, is_active: true }, orderBy: [{ urutan: 'asc' }, { id: 'asc' }] });
      const hiddenStage1Questions = await this.prisma.assessmentQuestion.findMany({ where: { tahap: 1, tahap2_hidden: true }, select: { id: true } });
      const hiddenStage1Ids = new Set(hiddenStage1Questions.map((question) => question.id));
      const stage1Answers = this.orderAssessmentAnswers((await this.getStage1Answers(inovasi.assessment_answers, true)).filter((answer) => !hiddenStage1Ids.has(answer.question_id)));
      const answers = composeStage2Answers(stage1Answers, saved, questions);
      return {
        ...inovasi, status: inovasi.status_tahap2, penilai: inovasi.penilai_tahap2,
        assigned_users: inovasi.penilai_tahap2.map((p) => ({ id: p.id, nama: p.nama_lengkap })),
        signatures,
        usulan_signatures: signatures,
        hasil_penilaian: hasilPenilaian(inovasi.penilai_tahap2, signatures, 2),
        assessment_answers: this.orderAssessmentAnswers(answers),
        requires_assessment_save: !signatures.length && answers.some((answer) => !saved.some((item) => item.question_id === answer.question_id)),
      };
    }
    const allSignatures = inovasi.usulan_signatures;
    const maySeeReviewerAnswers = (user?.role !== 'UNIT' && view !== 'self-assessment')
      || (user?.role === 'UNIT' && inovasi.status === StatusInovasi.PERBAIKAN);
    const savedAnswers = await this.getStage1Answers(inovasi.assessment_answers, maySeeReviewerAnswers);
    const showBlankTemplate = view === 'self-assessment'
      && inovasi.status !== StatusInovasi.DRAFT
      && savedAnswers.length === 0;
    const questions = showBlankTemplate ? await this.getActiveSelfAssessmentQuestions() : [];
    const selfAssessmentTemplateOnly = showBlankTemplate && questions.some((question) => !question.is_header);
    const answers = selfAssessmentTemplateOnly ? questions.map((question) => ({
      id: -question.id,
      inovasi_id: id,
      question_id: question.id,
      tahap: 1,
      source: 'SATKER',
      jawaban_boolean: false,
      catatan_string: null,
      link: null,
      custom_values: null,
      question,
    })) : savedAnswers;
    inovasi.usulan_signatures = allSignatures.filter((s) => s.tahap === 1);
    // Format assigned_users from penilai relation
    const assignedUsers = inovasi.penilai.map((p) => ({
      id: p.id,
      nama: p.nama_lengkap,
    }));

    // Format signatures from usulan_signatures relation
    const signatures = inovasi.usulan_signatures.map((sig) => ({
      id: sig.id,
      user_id: sig.user_id,
      role: sig.role,
      nama: sig.nama || sig.user.nama_lengkap,
      nip: sig.nip,
      ttd_image: sig.ttd_image,
      created_at: sig.created_at,
      jabatan: sig.jabatan,
      keputusan: sig.keputusan,
    }));

    return {
      ...inovasi,
      assessment_answers: this.orderAssessmentAnswers(answers),
      self_assessment_template_only: selfAssessmentTemplateOnly,
      hasil_penilaian: hasilPenilaian(inovasi.penilai, inovasi.usulan_signatures),
      hasil_penilaian_tahap1: hasilPenilaian(inovasi.penilai, allSignatures, 1),
      hasil_penilaian_tahap2: hasilPenilaian(inovasi.penilai_tahap2, allSignatures, 2),
      assigned_users: assignedUsers,
      signatures: signatures,
    };
  }

  private getActiveSelfAssessmentQuestions() {
    return this.prisma.assessmentQuestion.findMany({
      where: {
        tahap: 1,
        is_active: true,
        OR: [{ parent_id: null }, { parent: { tahap: 1, is_active: true, parent_id: null } }],
      },
    });
  }

  private async validateSelfAssessmentSubmission(answers: { question_id: number }[]) {
    if (!answers.length) {
      throw new BadRequestException('Self Assessment belum dimuat. Muat ulang formulir sebelum mengirim usulan.');
    }
    const questions = await this.getActiveSelfAssessmentQuestions();
    const submittedIds = new Set(answers.map((answer) => answer.question_id));
    if (submittedIds.size !== answers.length
      || submittedIds.size !== questions.length
      || !questions.some((question) => !question.is_header)
      || questions.some((question) => !submittedIds.has(question.id))) {
      throw new BadRequestException('Template Self Assessment belum lengkap atau sudah berubah. Muat ulang formulir sebelum mengirim usulan.');
    }
  }

  private validateKriteriaInovasi(values: string[]) {
    const allowed = new Set(KRITERIA_INOVASI_OPTIONS.map((value) => value.toLocaleLowerCase('id-ID')));
    const selected = values.map((value) => String(value).trim().toLocaleLowerCase('id-ID'));
    if (new Set(selected).size !== selected.length
      || selected.some((value) => !allowed.has(value))) {
      throw new BadRequestException('Kriteria inovasi tidak valid.');
    }
  }

  private async validateQuestionStage(answers: { question_id: number }[], tahap: number) {
    const ids = answers.map((a) => a.question_id);
    if (!ids.length) return;
    const count = await this.prisma.assessmentQuestion.count({ where: { id: { in: ids }, tahap } });
    if (count !== ids.length) throw new BadRequestException('Pertanyaan tidak sesuai tahap');
  }

  private validateTahap(tahap: number) {
    if (![1, 2].includes(tahap)) throw new BadRequestException('Tahap harus 1 atau 2');
  }

  private async getStage2QuestionIds(inovasiId: number, db: Prisma.TransactionClient = this.prisma) {
    const [source, additions] = await Promise.all([
      db.assessmentAnswer.findMany({ where: { inovasi_id: inovasiId, tahap: 1 }, select: { question_id: true } }),
      db.assessmentQuestion.findMany({ where: { tahap: 2, is_active: true }, select: { id: true } }),
    ]);
    return [...new Set([...source.map((answer) => answer.question_id), ...additions.map((question) => question.id)])];
  }

  async assignPenilai(inovasiId: number, penilaiIds: number[], tahap = 1) {
    this.validateTahap(tahap);
    if (!Array.isArray(penilaiIds) || penilaiIds.some((id) => !Number.isInteger(id)) || new Set(penilaiIds).size !== penilaiIds.length) throw new BadRequestException('Pilih penilai yang valid');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${inovasiId} FOR UPDATE`;
      const inovasi = await tx.inovasi.findUnique({
        where: { id: inovasiId },
        include: {
          penilai: { select: { id: true } },
          penilai_tahap2: { select: { id: true } },
        },
      });
      if (!inovasi) throw new NotFoundException('Inovasi tidak ditemukan');

      const users = await tx.user.findMany({
        where: { id: { in: penilaiIds }, role: 'REVIEWER', status_registrasi: 'APPROVED' },
        select: { id: true },
      });
      if (users.length !== penilaiIds.length) throw new NotFoundException('Beberapa user penilai tidak ditemukan');

      if (tahap === 2 && inovasi.status !== StatusInovasi.SELESAI_EVALUASI) throw new BadRequestException('Tahap 1 belum selesai');
      const currentReviewerIds = new Set(
        (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).map((reviewer) => reviewer.id),
      );
      const requestedReviewerIds = new Set(penilaiIds);
      const signatures = await tx.usulinSignature.findMany({
        where: { usulan_id: inovasiId, tahap },
        select: { user_id: true },
      });
      if (signatures.length) {
        if (penilaiIds.some((id) => !currentReviewerIds.has(id))) {
          throw new BadRequestException('Penilai baru tidak dapat ditambahkan setelah ada tanda tangan');
        }
        if (signatures.some((signature) => !requestedReviewerIds.has(signature.user_id))) {
          throw new BadRequestException('Penilai yang sudah menandatangani tidak dapat dihapus');
        }
      }
      return tx.inovasi.update({
        where: { id: inovasiId },
        data: {
          [tahap === 2 ? 'penilai_tahap2' : 'penilai']: { set: penilaiIds.map((id) => ({ id })) },
        },
        include: this.includeConfig,
      });
    });
  }

  async assignPenilaiBulk(inovasiIds: number[], penilaiIds: number[], tahap = 1) {
    this.validateTahap(tahap);
    if (!Array.isArray(inovasiIds) || !inovasiIds.length || inovasiIds.length > 200 || inovasiIds.some((id) => !Number.isInteger(id)) || new Set(inovasiIds).size !== inovasiIds.length) {
      throw new BadRequestException('Pilih maksimal 200 usulan yang valid');
    }
    if (!Array.isArray(penilaiIds) || !penilaiIds.length || penilaiIds.some((id) => !Number.isInteger(id)) || new Set(penilaiIds).size !== penilaiIds.length) {
      throw new BadRequestException('Pilih penilai yang valid');
    }

    return this.prisma.$transaction(async (tx) => {
      const [inovasiList, users] = await Promise.all([
        tx.inovasi.findMany({
          where: { id: { in: inovasiIds } },
          select: {
            id: true,
            status: true,
            penilai: { select: { id: true } },
            penilai_tahap2: { select: { id: true } },
            usulan_signatures: {
              where: { tahap },
              select: { user_id: true },
            },
          },
        }),
        tx.user.findMany({
          where: { id: { in: penilaiIds }, role: 'REVIEWER', status_registrasi: 'APPROVED' },
          select: { id: true },
        }),
      ]);

      if (inovasiList.length !== inovasiIds.length) {
        throw new NotFoundException('Beberapa usulan tidak ditemukan');
      }
      if (users.length !== penilaiIds.length) {
        throw new NotFoundException('Beberapa user penilai tidak ditemukan atau belum aktif');
      }

      const requestedReviewerIds = new Set(penilaiIds);
      for (const inovasi of inovasiList) {
        if (tahap === 2 && inovasi.status !== StatusInovasi.SELESAI_EVALUASI) {
          throw new BadRequestException('Tahap 2 hanya dapat ditugaskan pada usulan yang sudah menyelesaikan Tahap 1');
        }
        const currentReviewerIds = new Set(
          (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).map((reviewer) => reviewer.id),
        );
        if (inovasi.usulan_signatures.length) {
          if (penilaiIds.some((id) => !currentReviewerIds.has(id))) {
            throw new BadRequestException(`Usulan #${inovasi.id} sudah memiliki tanda tangan; penilai baru tidak dapat ditambahkan`);
          }
          if (inovasi.usulan_signatures.some((signature) => !requestedReviewerIds.has(signature.user_id))) {
            throw new BadRequestException(`Usulan #${inovasi.id} sudah memiliki tanda tangan; penilai yang menandatangani tidak dapat dihapus`);
          }
        }
      }

      const relation = tahap === 2 ? 'penilai_tahap2' : 'penilai';
      for (const inovasiId of inovasiIds) {
        await tx.inovasi.update({
          where: { id: inovasiId },
          data: { [relation]: { set: penilaiIds.map((id) => ({ id })) } },
        });
      }
      return { updated: inovasiIds.length, tahap };
    });
  }

  async removePenilaiBulk(inovasiIds: number[], penilaiIds: number[], tahap = 1) {
    this.validateTahap(tahap);
    if (!Array.isArray(inovasiIds) || !inovasiIds.length || inovasiIds.length > 200 || inovasiIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(inovasiIds).size !== inovasiIds.length) {
      throw new BadRequestException('Pilih maksimal 200 usulan yang valid');
    }
    if (!Array.isArray(penilaiIds) || !penilaiIds.length || penilaiIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(penilaiIds).size !== penilaiIds.length) {
      throw new BadRequestException('Pilih akun penilai yang valid untuk dihapus');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: number }>>`
        SELECT id FROM "Inovasi"
        WHERE id IN (${Prisma.join(inovasiIds)})
        ORDER BY id
        FOR UPDATE
      `;

      const proposals = await tx.inovasi.findMany({
        where: { id: { in: inovasiIds } },
        select: {
          id: true,
          penilai: { select: { id: true } },
          penilai_tahap2: { select: { id: true } },
          usulan_signatures: { where: { tahap }, select: { user_id: true } },
        },
      });
      if (proposals.length !== inovasiIds.length) {
        throw new NotFoundException('Beberapa usulan tidak ditemukan');
      }

      const relation = tahap === 2 ? 'penilai_tahap2' : 'penilai';
      let removed = 0;
      let skippedSigned = 0;
      let skippedNotAssigned = 0;
      let updated = 0;

      for (const proposal of proposals) {
        const assignedReviewers = tahap === 2 ? proposal.penilai_tahap2 : proposal.penilai;
        const assignedIds = new Set(assignedReviewers.map((reviewer) => reviewer.id));
        const signedIds = new Set(proposal.usulan_signatures.map((signature) => signature.user_id));
        const removeIds = penilaiIds.filter((id) => assignedIds.has(id) && !signedIds.has(id));

        skippedSigned += penilaiIds.filter((id) => assignedIds.has(id) && signedIds.has(id)).length;
        skippedNotAssigned += penilaiIds.filter((id) => !assignedIds.has(id)).length;
        if (!removeIds.length) continue;

        await tx.inovasi.update({
          where: { id: proposal.id },
          data: {
            [relation]: {
              set: assignedReviewers
                .filter((reviewer) => !removeIds.includes(reviewer.id))
                .map((reviewer) => ({ id: reviewer.id })),
            },
          },
        });
        removed += removeIds.length;
        updated += 1;
      }

      return { updated, removed, skipped_signed: skippedSigned, skipped_not_assigned: skippedNotAssigned, tahap };
    });
  }

  async assignPenilaiBySatkerBulk(satkerIds: number[], penilaiIds: number[], tahun: number, tahap = 1) {
    this.validateTahap(tahap);
    if (!Array.isArray(satkerIds) || !satkerIds.length || satkerIds.length > 200 || satkerIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(satkerIds).size !== satkerIds.length) {
      throw new BadRequestException('Pilih Satker yang valid');
    }
    if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) {
      throw new BadRequestException('Tahun pengajuan tidak valid');
    }
    if (!Array.isArray(penilaiIds) || !penilaiIds.length || penilaiIds.some((id) => !Number.isInteger(id) || id <= 0) || new Set(penilaiIds).size !== penilaiIds.length) {
      throw new BadRequestException('Pilih penilai yang valid');
    }

    const periodStart = new Date(Date.UTC(tahun, 0, 1));
    const periodEnd = new Date(Date.UTC(tahun + 1, 0, 1));
    return this.prisma.$transaction(async (tx) => {
      const [inovasiList, users] = await Promise.all([
        tx.inovasi.findMany({
          where: {
            satker_id: { in: satkerIds },
            submitted_at: { gte: periodStart, lt: periodEnd },
            status: tahap === 2 ? StatusInovasi.SELESAI_EVALUASI : { not: StatusInovasi.DRAFT },
          },
          select: {
            id: true,
            usulan_signatures: { where: { tahap }, select: { user_id: true } },
          },
        }),
        tx.user.findMany({
          where: { id: { in: penilaiIds }, role: 'REVIEWER', status_registrasi: 'APPROVED' },
          select: { id: true },
        }),
      ]);

      if (users.length !== penilaiIds.length) {
        throw new NotFoundException('Beberapa user penilai tidak ditemukan atau belum aktif');
      }

      const assignable = inovasiList.filter((inovasi) => inovasi.usulan_signatures.length === 0);
      const skippedSigned = inovasiList.length - assignable.length;
      const relation = tahap === 2 ? 'penilai_tahap2' : 'penilai';
      for (const inovasi of assignable) {
        await tx.inovasi.update({
          where: { id: inovasi.id },
          data: { [relation]: { set: penilaiIds.map((id) => ({ id })) } },
        });
      }

      return { updated: assignable.length, skipped_signed: skippedSigned, tahap, tahun, satker_count: satkerIds.length };
    });
  }

  async getPenilaiList(inovasiId: number) {
    const penilai = await this.prisma.inovasi.findUnique({
      where: { id: inovasiId },
      include: {
        penilai: {
          select: {
            id: true,
            nama_lengkap: true,
          },
        },
      },
    });
    if (!penilai) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }
    return penilai.penilai.map((p) => ({
      user_id: p.id,
      nama_lengkap: p.nama_lengkap,
    }));
  }

  private async enforceSatkerLocks(answers: any[], inovasiId?: number) {
    if (!answers.length) return;
    const questions = await this.prisma.assessmentQuestion.findMany({ where: { id: { in: answers.map((a) => a.question_id) }, OR: [{ satker_lock_mode: { in: ['RINCIAN', 'ROW'] } }, { is_header: true }] }, select: { id: true, pertanyaan: true, is_header: true, satker_lock_mode: true } });
    const saved = inovasiId ? await this.prisma.assessmentAnswer.findMany({ where: { inovasi_id: inovasiId, tahap: 1, source: 'SATKER' } }) : [];
    for (const answer of answers) {
      const question = questions.find((q) => q.id === answer.question_id);
      if (!question) continue;
      const prior = saved.find((a) => a.question_id === answer.question_id);
      if (question.is_header || question.satker_lock_mode === 'ROW') {
        Object.assign(answer, { jawaban_boolean: prior?.jawaban_boolean ?? false, catatan_string: prior?.catatan_string ?? '', link: prior?.link ?? '', custom_values: prior?.custom_values ?? {} });
        continue;
      }
      const submittedValues = answer.custom_values && typeof answer.custom_values === 'object' && !Array.isArray(answer.custom_values) ? answer.custom_values : {};
      const priorValues = prior?.custom_values && typeof prior.custom_values === 'object' && !Array.isArray(prior.custom_values) ? prior.custom_values : {};
      answer.custom_values = { ...submittedValues, __rincian: priorValues.__rincian ?? question.pertanyaan };
    }
  }

  private normalizeDraftAnswers(dto: SaveInovasiDraftDto) {
    return (dto.assessment_answers ?? [])
      .filter((answer) => Number.isInteger(answer.question_id))
      .map((answer) => ({
        question_id: answer.question_id!,
        jawaban_boolean: answer.jawaban_boolean ?? false,
        catatan_string: answer.catatan_string ?? '',
        link: answer.link ?? '',
        custom_values: answer.custom_values ?? {},
      }));
  }

  private normalizeSupportLink(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
      const raw = value.trim();
      const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      const trackingParams = new Set(['usp', 'fbclid', 'gclid', 'mc_cid', 'mc_eid']);
      const retainedParams = [...url.searchParams.entries()]
        .filter(([key]) => !trackingParams.has(key.toLowerCase()) && !key.toLowerCase().startsWith('utm_'))
        .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
      const query = new URLSearchParams(retainedParams).toString();
      const pathname = url.pathname.replace(/\/+$/, '') || '/';
      return `${url.hostname.toLowerCase()}${pathname}${query ? `?${query}` : ''}`;
    } catch {
      return null;
    }
  }

  private containsWebLink(value: string) {
    return /(?:https?:\/\/|ftp:\/\/|www\.)[^\s]+|(?:^|[^a-z0-9@])(?:[a-z0-9-]+\.)+[a-z]{2,63}(?::\d+)?(?:[/?#][^\s]*)?/i.test(value)
      || /(?:^|[^a-z0-9@])(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#][^\s]*)?/.test(value);
  }

  private async validateUniqueSupportLinks(
    db: Pick<PrismaService, 'assessmentTemplatePackage' | 'assessmentAnswer' | 'assessmentQuestion'>,
    submittedAnswers: any[],
    inovasiId?: number,
    mergeExisting = false,
  ) {
    const { columns } = await loadTemplateConfig(db, 1);
    const editableBySatker = (column: { owner?: 'BOTH' | 'SATKER' | 'REVIEWER' }) => (column.owner ?? 'BOTH') !== 'REVIEWER';
    const urlColumns = columns.filter((column) => column.type === 'url' && editableBySatker(column));
    const textColumns = columns.filter((column) => (column.type === 'text' || column.type === 'textarea') && editableBySatker(column));
    if (!urlColumns.length && !textColumns.length) return;

    let answers = submittedAnswers;
    if (mergeExisting && inovasiId && submittedAnswers.length) {
      const questionIds = submittedAnswers.map((answer) => answer.question_id);
      const existingAnswers = await db.assessmentAnswer.findMany({
        where: { inovasi_id: inovasiId, tahap: 1, source: 'SATKER', question_id: { notIn: questionIds } },
        select: { id: true, question_id: true, jawaban_boolean: true, catatan_string: true, link: true, custom_values: true },
      });
      answers = [...existingAnswers, ...submittedAnswers];
    }

    const questionConfigs = await db.assessmentQuestion.findMany({
      where: { id: { in: answers.map((answer) => answer.question_id) } },
      select: { id: true, is_header: true, satker_lock_mode: true },
    });

    const seen = new Map<string, { question_id: number }>();
    for (const answer of answers) {
      const question = questionConfigs.find((item) => item.id === answer.question_id);
      if (question?.is_header || question?.satker_lock_mode === 'ROW') continue;
      for (const column of columns.filter((item) => (item.type === 'url' || item.type === 'text' || item.type === 'textarea') && editableBySatker(item))) {
        const customValues = answer.custom_values && typeof answer.custom_values === 'object' && !Array.isArray(answer.custom_values)
          ? answer.custom_values
          : {};
        const legacyValue = column.key === 'link' ? answer.link : column.key === 'catatan_string' ? answer.catatan_string : undefined;
        const value = customValues[column.key] ?? legacyValue;
        if (value === undefined || value === null || value === '') continue;
        if (column.type === 'text' || column.type === 'textarea') {
          if (typeof value !== 'string') throw new BadRequestException(`Kolom ${column.title} hanya menerima keterangan teks`);
          if (this.containsWebLink(value)) throw new BadRequestException(`Kolom ${column.title} hanya menerima teks, bukan tautan. Gunakan kolom dengan format Link.`);
          continue;
        }
        if (typeof value !== 'string') throw new BadRequestException(`Kolom ${column.title} harus berisi tautan yang valid`);
        if (!value.trim()) continue;
        const normalized = this.normalizeSupportLink(value);
        if (!normalized) throw new BadRequestException(`Kolom ${column.title} harus berisi tautan http/https yang valid`);
        const prior = seen.get(normalized);
        if (prior) {
          throw new BadRequestException(`Link data dukung pada kolom ${column.title} pertanyaan ${answer.question_id} sudah digunakan pada pertanyaan ${prior.question_id}`);
        }
        seen.set(normalized, { question_id: answer.question_id });
      }
    }
  }

  private async captureRevisionSnapshot(
    db: Prisma.TransactionClient,
    inovasiId: number,
  ): Promise<Prisma.InputJsonObject> {
    const [inovasi, template] = await Promise.all([
      db.inovasi.findUnique({
        where: { id: inovasiId },
        include: {
          assessment_answers: {
            where: { tahap: 1, source: 'SATKER' },
            include: { question: { select: { id: true, pertanyaan: true, is_header: true, question_title_override: true } } },
            orderBy: { question: { urutan: 'asc' } },
          },
        },
      }),
      loadTemplateConfig(db, 1),
    ]);
    if (!inovasi) throw new NotFoundException('Inovasi tidak ditemukan');

    const fields: Record<string, unknown> = {
      judul: inovasi.judul,
      deskripsi_inovasi: inovasi.deskripsi_inovasi ?? '',
      tahun: inovasi.tahun,
      jenis_inovasi: inovasi.jenis_inovasi_pilihan.length ? inovasi.jenis_inovasi_pilihan : inovasi.jenis_inovasi,
      kriteria_inovasi: inovasi.kriteria_inovasi,
      link_data_dukung: inovasi.link_data_dukung,
      penanggung_jawab: inovasi.pic_penanggung_jawab ?? [{ nama: inovasi.pic_nama, no_whatsapp: inovasi.pic_telp }],
    };
    const assessmentAnswers = inovasi.assessment_answers
      .filter((answer) => !answer.question.is_header)
      .map((answer) => {
        const customValues = answer.custom_values && typeof answer.custom_values === 'object' && !Array.isArray(answer.custom_values)
          ? answer.custom_values as Record<string, unknown>
          : {};
        const values: Record<string, unknown> = {};
        if (Object.prototype.hasOwnProperty.call(customValues, '__rincian')) {
          values.__rincian = customValues.__rincian;
        }
        for (const column of template.columns) {
          values[column.key] = customValues[column.key] ?? (column.key === 'jawaban_boolean'
            ? answer.jawaban_boolean
            : column.key === 'catatan_string'
              ? answer.catatan_string ?? ''
              : column.key === 'link'
                ? answer.link ?? ''
                : '');
        }
        const labels: Record<string, string> = { __rincian: 'Rincian' };
        for (const column of template.columns) labels[column.key] = column.title;
        return {
          question_id: answer.question_id,
          question: answer.question.question_title_override || answer.question.pertanyaan,
          values,
          labels,
        };
      });

    return JSON.parse(JSON.stringify({ fields, assessment_answers: assessmentAnswers })) as Prisma.InputJsonObject;
  }

  private diffRevisionSnapshots(beforeValue: Prisma.JsonValue | Prisma.InputJsonValue, afterValue: Prisma.InputJsonObject) {
    const before = beforeValue as any;
    const after = afterValue as any;
    const changes: { section: string; item: string; field: string; before: unknown; after: unknown }[] = [];
    const display = (value: unknown) => {
      if (value === null || value === undefined || value === '') return '—';
      if (Array.isArray(value)) return value.map((item) => item && typeof item === 'object'
        ? [item.nama, item.no_whatsapp].filter(Boolean).join(' · ') || JSON.stringify(item)
        : String(item)).join(', ');
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    };
    const normalizeForComparison = (value: unknown) => value === undefined || value === null || value === '' || value === false ? null : value;
    const equal = (left: unknown, right: unknown) => JSON.stringify(normalizeForComparison(left)) === JSON.stringify(normalizeForComparison(right));

    for (const [key, label] of Object.entries({
      judul: 'Judul inovasi', deskripsi_inovasi: 'Deskripsi inovasi', tahun: 'Tahun inovasi',
      jenis_inovasi: 'Jenis inovasi', kriteria_inovasi: 'Kriteria inovasi',
      link_data_dukung: 'Link data dukung', penanggung_jawab: 'Penanggung jawab',
    })) {
      const oldValue = before?.fields?.[key];
      const newValue = after?.fields?.[key];
      if (!equal(oldValue, newValue)) changes.push({ section: 'Data inovasi', item: '', field: label, before: display(oldValue), after: display(newValue) });
    }

    const priorAnswers = new Map<number, any>((before?.assessment_answers ?? []).map((answer: any) => [Number(answer.question_id), answer]));
    const currentAnswers = new Map<number, any>((after?.assessment_answers ?? []).map((answer: any) => [Number(answer.question_id), answer]));
    const questionIds = new Set<number>([...priorAnswers.keys(), ...currentAnswers.keys()]);
    for (const questionId of questionIds) {
      const oldAnswer = priorAnswers.get(questionId);
      const newAnswer = currentAnswers.get(questionId);
      const item = newAnswer?.question ?? oldAnswer?.question ?? `Pertanyaan ${questionId}`;
      const keys = new Set<string>([...Object.keys(oldAnswer?.values ?? {}), ...Object.keys(newAnswer?.values ?? {})]);
      for (const key of keys) {
        const oldValue = oldAnswer?.values?.[key];
        const newValue = newAnswer?.values?.[key];
        const field = newAnswer?.labels?.[key] ?? oldAnswer?.labels?.[key] ?? (key === '__rincian' ? 'Rincian' : key);
        if (!equal(oldValue, newValue)) changes.push({ section: 'Self Assessment', item, field, before: display(oldValue), after: display(newValue) });
      }
    }
    return changes;
  }

  private async ensureOpenRevisionLog(tx: Prisma.TransactionClient, inovasi: { id: number; catatan_perbaikan: string | null }, userId?: number) {
    const openLog = await tx.inovasiRevisionLog.findFirst({
      where: { inovasi_id: inovasi.id, resubmitted_at: null },
      orderBy: { requested_at: 'desc' },
    });
    if (openLog) return openLog;
    const snapshot = await this.captureRevisionSnapshot(tx, inovasi.id);
    return tx.inovasiRevisionLog.create({
      data: {
        inovasi_id: inovasi.id,
        requested_by_id: userId,
        catatan_perbaikan: inovasi.catatan_perbaikan?.trim() || 'Usulan dikembalikan untuk diperbaiki.',
        snapshot,
      },
    });
  }

  private async finalizeRevisionLog(tx: Prisma.TransactionClient, logId: number, inovasiId: number, userId: number) {
    const log = await tx.inovasiRevisionLog.findUniqueOrThrow({ where: { id: logId } });
    const snapshot = await this.captureRevisionSnapshot(tx, inovasiId);
    const changes = this.diffRevisionSnapshots(log.snapshot ?? {}, snapshot);
    return tx.inovasiRevisionLog.update({
      where: { id: logId },
      data: { changes: changes as Prisma.InputJsonArray, resubmitted_at: new Date(), resubmitted_by_id: userId },
    });
  }

  private normalizeDraftContacts(contacts?: Record<string, unknown>[]) {
    return (contacts ?? []).slice(0, 2).map((contact) => ({
      nama: typeof contact.nama === 'string' ? contact.nama : '',
      no_whatsapp: typeof contact.no_whatsapp === 'string' ? contact.no_whatsapp : '',
    }));
  }

  async createDraft(
    dto: SaveInovasiDraftDto,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    if (user.role !== 'UNIT' || !user.satker_id) {
      throw new ForbiddenException('Hanya akun unit yang dapat menyimpan draft usulan');
    }
    await this.assertSubmissionIsUnlocked();

    const { columns } = await loadTemplateConfig(this.prisma, 1);
    const assessmentAnswers = this.filterAnswersByOwner(this.normalizeDraftAnswers(dto), columns, 'SATKER');
    await this.validateQuestionStage(assessmentAnswers, 1);
    await this.enforceSatkerLocks(assessmentAnswers);
    await this.validateUniqueSupportLinks(this.prisma, assessmentAnswers);
    const contacts = this.normalizeDraftContacts(dto.pic_penanggung_jawab);
    const picNama = dto.pic_nama ?? contacts[0]?.nama ?? '';
    const picTelp = dto.pic_telp ?? contacts[0]?.no_whatsapp ?? '';

    return this.prisma.$transaction(async (tx) => {
      const inovasi = await tx.inovasi.create({
        data: {
          judul: dto.judul?.trim() || 'Draft Usulan',
          deskripsi_inovasi: dto.deskripsi_inovasi?.trim() || null,
          tahun: dto.tahun ?? new Date().getFullYear(),
          jenis_inovasi: dto.jenis_inovasi ?? '',
          jenis_inovasi_pilihan: dto.jenis_inovasi_pilihan ?? [],
          jenis_inovasi_lainnya: dto.jenis_inovasi_lainnya ?? '',
          kriteria_inovasi: dto.kriteria_inovasi ?? [],
          link_data_dukung: dto.link_data_dukung ?? '',
          pic_nama: picNama,
          pic_telp: picTelp,
          pic_penanggung_jawab: contacts as Prisma.InputJsonArray,
          status: StatusInovasi.DRAFT,
          satker_id: user.satker_id!,
          user_id: user.sub,
        },
      });

      if (assessmentAnswers.length) {
        await tx.assessmentAnswer.createMany({
          data: assessmentAnswers.map((answer) => ({
            inovasi_id: inovasi.id,
            question_id: answer.question_id,
            source: 'SATKER',
            jawaban_boolean: answer.jawaban_boolean,
            catatan_string: answer.catatan_string,
            link: answer.link,
            custom_values: answer.custom_values,
          })),
        });
      }

      return tx.inovasi.findUnique({ where: { id: inovasi.id }, include: this.includeConfig });
    });
  }

  async updateDraft(
    id: number,
    dto: SaveInovasiDraftDto,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    const existing = await this.prisma.inovasi.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Inovasi tidak ditemukan');
    if (existing.status !== StatusInovasi.DRAFT && existing.status !== StatusInovasi.PERBAIKAN) {
      throw new ForbiddenException('Hanya draft atau usulan yang perlu perbaikan yang dapat disimpan sebagai draft');
    }
    if (user.role !== 'UNIT' || existing.user_id !== user.sub || existing.satker_id !== user.satker_id) {
      throw new ForbiddenException('Anda tidak memiliki akses ke draft ini');
    }

    const { columns } = await loadTemplateConfig(this.prisma, 1);
    const assessmentAnswers = this.filterAnswersByOwner(this.normalizeDraftAnswers(dto), columns, 'SATKER');
    await this.validateQuestionStage(assessmentAnswers, 1);
    await this.enforceSatkerLocks(assessmentAnswers, id);
    const contacts = this.normalizeDraftContacts(dto.pic_penanggung_jawab);
    const data: Prisma.InovasiUpdateInput = {};
    if (dto.judul !== undefined) data.judul = dto.judul.trim() || 'Draft Usulan';
    if (dto.deskripsi_inovasi !== undefined) data.deskripsi_inovasi = dto.deskripsi_inovasi.trim() || null;
    if (dto.tahun !== undefined) data.tahun = dto.tahun;
    if (dto.jenis_inovasi !== undefined) data.jenis_inovasi = dto.jenis_inovasi;
    if (dto.jenis_inovasi_pilihan !== undefined) data.jenis_inovasi_pilihan = dto.jenis_inovasi_pilihan;
    if (dto.jenis_inovasi_lainnya !== undefined) data.jenis_inovasi_lainnya = dto.jenis_inovasi_lainnya;
    if (dto.kriteria_inovasi !== undefined) data.kriteria_inovasi = dto.kriteria_inovasi;
    if (dto.link_data_dukung !== undefined) data.link_data_dukung = dto.link_data_dukung;
    if (dto.pic_nama !== undefined) data.pic_nama = dto.pic_nama;
    if (dto.pic_telp !== undefined) data.pic_telp = dto.pic_telp;
    if (dto.pic_penanggung_jawab !== undefined) {
      data.pic_penanggung_jawab = contacts as Prisma.InputJsonArray;
      if (dto.pic_nama === undefined) data.pic_nama = contacts[0]?.nama ?? '';
      if (dto.pic_telp === undefined) data.pic_telp = contacts[0]?.no_whatsapp ?? '';
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
      const latest = await tx.inovasi.findUnique({ where: { id }, select: { status: true } });
      if (!latest || (latest.status !== StatusInovasi.DRAFT && latest.status !== StatusInovasi.PERBAIKAN)) {
        throw new ForbiddenException('Usulan sudah tidak dapat diubah sebagai draft.');
      }
      if (assessmentAnswers.length) await this.validateUniqueSupportLinks(tx, assessmentAnswers, id, true);
      if (existing.status === StatusInovasi.PERBAIKAN) await this.ensureOpenRevisionLog(tx, existing);
      await tx.inovasi.update({ where: { id }, data });
      if (assessmentAnswers.length > 0) {
        await tx.assessmentAnswer.deleteMany({
          where: {
            inovasi_id: id,
            tahap: 1,
            source: 'SATKER',
            question_id: { in: assessmentAnswers.map((answer) => answer.question_id) },
          },
        });
        await tx.assessmentAnswer.createMany({
          data: assessmentAnswers.map((answer) => ({
            inovasi_id: id,
            question_id: answer.question_id,
            source: 'SATKER',
            jawaban_boolean: answer.jawaban_boolean,
            catatan_string: answer.catatan_string,
            link: answer.link,
            custom_values: answer.custom_values,
          })),
        });
      }
      return tx.inovasi.findUnique({ where: { id }, include: this.includeConfig });
    });
  }

  async create(
    dto: CreateInovasiDto,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    if (user.role === 'UNIT') await this.assertSubmissionIsUnlocked();
    this.validateKriteriaInovasi(dto.kriteria_inovasi);
    const { columns } = await loadTemplateConfig(this.prisma, 1);
    const assessment_answers = this.filterAnswersByOwner(dto.assessment_answers ?? [], columns, 'SATKER');
    await this.validateSelfAssessmentSubmission(assessment_answers ?? []);
    if (user.role === 'UNIT') await this.enforceSatkerLocks(assessment_answers ?? [], undefined);
    if (assessment_answers?.length) await this.validateUniqueSupportLinks(this.prisma, assessment_answers);
    const inovasiData = {
      judul: dto.judul,
      deskripsi_inovasi: dto.deskripsi_inovasi,
      tahun: dto.tahun,
      jenis_inovasi: dto.jenis_inovasi,
      jenis_inovasi_pilihan: dto.jenis_inovasi_pilihan?.length ? dto.jenis_inovasi_pilihan : [dto.jenis_inovasi],
      jenis_inovasi_lainnya: dto.jenis_inovasi_lainnya,
      kriteria_inovasi: dto.kriteria_inovasi,
      link_data_dukung: dto.link_data_dukung,
      pic_nama: dto.pic_nama,
      pic_telp: dto.pic_telp,
      pic_penanggung_jawab: (dto.pic_penanggung_jawab?.length
        ? dto.pic_penanggung_jawab.map(({ nama, no_whatsapp }) => ({ nama, no_whatsapp }))
        : [{ nama: dto.pic_nama, no_whatsapp: dto.pic_telp }]) as Prisma.InputJsonArray,
    };

    return this.prisma.$transaction(async (tx) => {
      const inovasi = await tx.inovasi.create({
        data: {
          ...inovasiData,
          status: 'PENDING',
          submitted_at: new Date(),
          satker_id: user.satker_id!,
          user_id: user.sub,
        },
      });

      if (assessment_answers && assessment_answers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: assessment_answers.map((a) => ({
            inovasi_id: inovasi.id,
            question_id: a.question_id,
            source: 'SATKER',
            jawaban_boolean: a.jawaban_boolean,
            catatan_string: a.catatan_string,
            link: a.link,
            custom_values: a.custom_values ?? {},
          })),
        });
      }

      return tx.inovasi.findUnique({
        where: { id: inovasi.id },
        include: this.includeConfig,
      });
    });
  }

  async update(
    id: number,
    dto: UpdateInovasiDto,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    const existing = await this.prisma.inovasi.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    if (user.role !== 'UNIT') throw new ForbiddenException('Reviewer tidak dapat mengubah data usulan Satker');

    if (existing.status !== StatusInovasi.PERBAIKAN && existing.status !== StatusInovasi.DRAFT) {
      throw new ForbiddenException(
        'Inovasi hanya dapat diubah jika berstatus Draft atau Perlu Perbaikan',
      );
    }

    if (existing.status === StatusInovasi.DRAFT && (user.role !== 'UNIT' || existing.user_id !== user.sub)) {
      throw new ForbiddenException('Anda tidak memiliki akses ke draft ini');
    }

    if (user.role === 'UNIT' && existing.satker_id !== user.satker_id) {
      throw new ForbiddenException('Anda tidak memiliki akses ke inovasi ini');
    }

    this.validateKriteriaInovasi(dto.kriteria_inovasi ?? existing.kriteria_inovasi);

    if (user.role === 'UNIT') await this.assertSubmissionIsUnlocked();

    const { columns } = await loadTemplateConfig(this.prisma, 1);
    const assessment_answers = this.filterAnswersByOwner(dto.assessment_answers ?? [], columns, 'SATKER');
    await this.validateSelfAssessmentSubmission(assessment_answers ?? []);
    if (user.role === 'UNIT') await this.enforceSatkerLocks(assessment_answers ?? [], id);
    if (assessment_answers?.length) await this.validateUniqueSupportLinks(this.prisma, assessment_answers);
    const inovasiData: Record<string, any> = {};
    if (dto.judul !== undefined) inovasiData.judul = dto.judul;
    if (dto.deskripsi_inovasi !== undefined) inovasiData.deskripsi_inovasi = dto.deskripsi_inovasi;
    if (dto.tahun !== undefined) inovasiData.tahun = dto.tahun;
    if (dto.jenis_inovasi !== undefined)
      inovasiData.jenis_inovasi = dto.jenis_inovasi;
    if (dto.jenis_inovasi_pilihan !== undefined)
      inovasiData.jenis_inovasi_pilihan = dto.jenis_inovasi_pilihan;
    if (dto.jenis_inovasi_lainnya !== undefined)
      inovasiData.jenis_inovasi_lainnya = dto.jenis_inovasi_lainnya;
    if (dto.kriteria_inovasi !== undefined)
      inovasiData.kriteria_inovasi = dto.kriteria_inovasi;
    if (dto.link_data_dukung !== undefined)
      inovasiData.link_data_dukung = dto.link_data_dukung;
    if (dto.pic_nama !== undefined) inovasiData.pic_nama = dto.pic_nama;
    if (dto.pic_telp !== undefined) inovasiData.pic_telp = dto.pic_telp;
    if (dto.pic_penanggung_jawab !== undefined)
      inovasiData.pic_penanggung_jawab = dto.pic_penanggung_jawab;

    inovasiData.status = StatusInovasi.PENDING;
    inovasiData.catatan_perbaikan = null;
    if (existing.status === StatusInovasi.DRAFT) {
      inovasiData.submitted_at = new Date();
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
      const latest = await tx.inovasi.findUnique({ where: { id }, select: { status: true, user_id: true, satker_id: true } });
      if (!latest || (latest.status !== StatusInovasi.DRAFT && latest.status !== StatusInovasi.PERBAIKAN)
        || latest.user_id !== user.sub || latest.satker_id !== user.satker_id) {
        throw new ForbiddenException('Usulan sudah tidak dapat diubah oleh akun ini.');
      }
      if (assessment_answers?.length) await this.validateUniqueSupportLinks(tx, assessment_answers);
      const revisionLog = existing.status === StatusInovasi.PERBAIKAN
        ? await this.ensureOpenRevisionLog(tx, existing)
        : null;
      await tx.inovasi.update({
        where: { id },
        data: inovasiData,
      });

      if (assessment_answers && assessment_answers.length > 0) {
        await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1, source: 'SATKER' } });
        if (existing.status === 'PERBAIKAN') {
          await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1, source: 'PENILAI' } });
        }
        await tx.assessmentAnswer.createMany({
          data: assessment_answers.map((a: any) => ({
            inovasi_id: id,
            question_id: a.question_id,
            source: 'SATKER',
            jawaban_boolean: a.jawaban_boolean,
            catatan_string: a.catatan_string,
            link: a.link,
            custom_values: a.custom_values ?? {},
          })),
        });
      }

      if (revisionLog) await this.finalizeRevisionLog(tx, revisionLog.id, id, user.sub);

      return tx.inovasi.findUnique({
        where: { id },
        include: this.includeConfig,
      });
    });
  }

  async remove(
    id: number,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    const existing = await this.prisma.inovasi.findUnique({ where: { id } });

    if (!existing) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    if (existing.status !== StatusInovasi.PERBAIKAN && existing.status !== StatusInovasi.DRAFT) {
      throw new ForbiddenException(
        'Inovasi hanya dapat dihapus jika berstatus Draft atau Perlu Perbaikan',
      );
    }

    if (existing.status === StatusInovasi.DRAFT && (user.role !== 'UNIT' || existing.user_id !== user.sub)) {
      throw new ForbiddenException('Anda tidak memiliki akses ke draft ini');
    }

    if (user.role === 'UNIT' && existing.satker_id !== user.satker_id) {
      throw new ForbiddenException('Anda tidak memiliki akses ke inovasi ini');
    }

    await this.prisma.inovasi.delete({ where: { id } });

    return { message: 'Inovasi berhasil dihapus' };
  }

  async updateAssessmentCellsByPenilai(
    inovasiId: number,
    dto: UpdateAssessmentCellsDto,
    user: { sub: number; role: string },
    tahap = 1,
  ) {
    this.validateTahap(tahap);
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id: inovasiId },
      include: { penilai: { select: { id: true } }, penilai_tahap2: { select: { id: true } } },
    });
    if (!inovasi) throw new NotFoundException('Inovasi tidak ditemukan');

    const isAssigned = (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).some((reviewer) => reviewer.id === user.sub);
    if (!isAssigned) throw new ForbiddenException('Anda tidak ditugaskan sebagai penilai inovasi ini');

    const status = tahap === 2 ? inovasi.status_tahap2 : inovasi.status;
    if (status === StatusInovasi.PERBAIKAN) {
      throw new ForbiddenException('Usulan sedang menunggu perbaikan Satker. Reviewer belum dapat mengedit penilaian.');
    }
    if (tahap === 2 && inovasi.status !== StatusInovasi.SELESAI_EVALUASI) {
      throw new BadRequestException('Tahap 1 belum selesai');
    }
    if (await this.prisma.usulinSignature.count({ where: { usulan_id: inovasiId, tahap } })) {
      throw new ForbiddenException('Penilaian sudah ditandatangani');
    }

    const { columns } = await loadTemplateConfig(this.prisma, tahap);
    const allowedQuestionIds = new Set(tahap === 2
      ? await this.getStage2QuestionIds(inovasiId)
      : (await this.prisma.assessmentQuestion.findMany({
          where: { tahap: 1, is_active: true },
          select: { id: true },
        })).map((question) => question.id));
    const questionIds = [...new Set(dto.cells.map((cell) => cell.question_id))];
    const questions = await this.prisma.assessmentQuestion.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, is_header: true, question_title_override: true },
    });
    const questionById = new Map(questions.map((question) => [question.id, question]));
    const cellKeys = new Set<string>();

    for (const cell of dto.cells) {
      const key = `${cell.question_id}:${cell.column_key}`;
      if (cellKeys.has(key)) throw new BadRequestException('Sel yang sama hanya boleh dikirim sekali dalam satu penyimpanan.');
      cellKeys.add(key);
      if (!allowedQuestionIds.has(cell.question_id)) throw new BadRequestException('Pertanyaan tidak sesuai tahap');
      const question = questionById.get(cell.question_id);
      if (!question || question.is_header) throw new BadRequestException('Baris header tidak dapat diubah');
      if (!['string', 'number', 'boolean'].includes(typeof cell.value)) throw new BadRequestException('Nilai kolom tidak valid');

      if (cell.column_key === '__kesimpulan' || cell.column_key === '__kesimpulan_catatan') {
        if (tahap !== 2 || question.question_title_override !== '__FINAL_CONCLUSION__') {
          throw new BadRequestException('Kolom kesimpulan hanya tersedia pada baris Kesimpulan Penilaian Akhir');
        }
        if (typeof cell.value !== 'string') throw new BadRequestException('Kesimpulan harus berupa teks');
        if (cell.column_key === '__kesimpulan' && cell.value !== '' && ![
          'Tidak ada inovasi nilai 0',
          'Diterima sebagai inovasi, dapat dihargai 0,5',
          'Diterima sebagai inovasi percontohan nasional nilai 1',
          'Lainnya',
        ].includes(cell.value)) throw new BadRequestException('Pilih kesimpulan yang tersedia');
        continue;
      }

      const column = columns.find((item) => item.key === cell.column_key);
      if (!column || column.owner === 'SATKER' || column.type === 'readonly') {
        throw new ForbiddenException('Kolom ini tidak dapat diubah oleh reviewer');
      }
      const empty = cell.value === '';
      if (column.type === 'checkbox' && typeof cell.value !== 'boolean') throw new BadRequestException(`Kolom ${column.title} harus berupa centang`);
      if (column.type === 'number' && !empty && (typeof cell.value !== 'number' || !Number.isFinite(cell.value))) throw new BadRequestException(`Kolom ${column.title} harus berupa angka`);
      if (column.type === 'score' && !empty && (typeof cell.value !== 'number' || !Number.isInteger(cell.value) || cell.value < 1 || cell.value > 5)) throw new BadRequestException(`Kolom ${column.title} harus berupa skor 1–5`);
      if (['select', 'radio'].includes(column.type) && !empty && (typeof cell.value !== 'string' || !(column.options ?? []).includes(cell.value))) throw new BadRequestException(`Pilih opsi yang tersedia pada kolom ${column.title}`);
      if (column.type === 'url' && !empty) {
        try {
          const url = new URL(String(cell.value));
          if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
        } catch {
          throw new BadRequestException(`Kolom ${column.title} harus berupa tautan http/https`);
        }
      }
      if ((column.type === 'text' || column.type === 'textarea') && this.containsWebLink(String(cell.value))) {
        throw new BadRequestException(`Kolom ${column.title} hanya menerima teks, bukan tautan. Gunakan kolom dengan format Link.`);
      }
      if (column.type === 'date' && !empty && (typeof cell.value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(cell.value) || Number.isNaN(Date.parse(cell.value)))) {
        throw new BadRequestException(`Kolom ${column.title} harus berupa tanggal`);
      }
      if (['text', 'textarea', 'url', 'date'].includes(column.type) && typeof cell.value !== 'string') {
        throw new BadRequestException(`Kolom ${column.title} harus berupa teks`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${inovasiId} FOR UPDATE`;
      const latest = await tx.inovasi.findUnique({
        where: { id: inovasiId },
        include: { penilai: { select: { id: true } }, penilai_tahap2: { select: { id: true } } },
      });
      if (!latest) throw new NotFoundException('Inovasi tidak ditemukan');
      const stillAssigned = (tahap === 2 ? latest.penilai_tahap2 : latest.penilai).some((reviewer) => reviewer.id === user.sub);
      if (!stillAssigned) throw new ForbiddenException('Penugasan reviewer sudah berubah');
      const latestStatus = tahap === 2 ? latest.status_tahap2 : latest.status;
      if (latestStatus === StatusInovasi.PERBAIKAN) {
        throw new ForbiddenException('Usulan sedang menunggu perbaikan Satker. Reviewer belum dapat mengedit penilaian.');
      }
      if (tahap === 2 && latest.status !== StatusInovasi.SELESAI_EVALUASI) throw new BadRequestException('Tahap 1 belum selesai');
      if (await tx.usulinSignature.count({ where: { usulan_id: inovasiId, tahap } })) {
        throw new ForbiddenException('Penilaian sudah ditandatangani');
      }

      for (const cell of dto.cells) {
        const existing = await tx.assessmentAnswer.findFirst({
          where: { inovasi_id: inovasiId, question_id: cell.question_id, tahap, source: 'PENILAI' },
        });
        const currentValues = existing?.custom_values && typeof existing.custom_values === 'object' && !Array.isArray(existing.custom_values)
          ? existing.custom_values as Record<string, Prisma.InputJsonValue>
          : {};
        const customValues = { ...currentValues, [cell.column_key]: cell.value };
        const data: Prisma.AssessmentAnswerUpdateInput = {
          custom_values: customValues as Prisma.InputJsonObject,
        };
        if (cell.column_key === 'jawaban_boolean') data.jawaban_boolean = cell.value as boolean;
        if (cell.column_key === 'catatan_string') data.catatan_string = cell.value as string;
        if (cell.column_key === 'link') data.link = cell.value as string;

        if (existing) {
          await tx.assessmentAnswer.update({ where: { id: existing.id }, data });
        } else {
          await tx.assessmentAnswer.create({
            data: {
              inovasi_id: inovasiId,
              question_id: cell.question_id,
              tahap,
              source: 'PENILAI',
              jawaban_boolean: cell.column_key === 'jawaban_boolean' ? cell.value as boolean : false,
              catatan_string: cell.column_key === 'catatan_string' ? cell.value as string : null,
              link: cell.column_key === 'link' ? cell.value as string : null,
              custom_values: customValues as Prisma.InputJsonObject,
            },
          });
        }
      }
    });

    return { message: 'Perubahan kolom berhasil tersimpan', updated_cells: dto.cells.length };
  }

  async updateAssessmentByPenilai(
    inovasiId: number,
    dto: UpdateAssessmentPenilaiDto,
    user: { sub: number; role: string },
    tahap = 1,
  ) {
    this.validateTahap(tahap);
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id: inovasiId },
      include: { penilai: { select: { id: true } }, penilai_tahap2: { select: { id: true } } },
    });

    if (!inovasi) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    const assignedReviewers = tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai;
    if (assignedReviewers.length > 1) {
      throw new ConflictException('Sesi penilaian kolaboratif sudah aktif. Muat ulang halaman agar penyimpanan per kolom dapat digunakan.');
    }

    const isPenilai = (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).some((p) => p.id === user.sub);
    if (!isPenilai) {
      throw new ForbiddenException(
        'Anda tidak ditugaskan sebagai penilai inovasi ini',
      );
    }

    const stageStatus = tahap === 2 ? inovasi.status_tahap2 : inovasi.status;
    if (stageStatus === StatusInovasi.PERBAIKAN) {
      throw new ForbiddenException('Usulan sedang menunggu perbaikan Satker. Reviewer belum dapat mengedit penilaian.');
    }

    if (tahap === 2 && inovasi.status !== StatusInovasi.SELESAI_EVALUASI) throw new BadRequestException('Tahap 1 belum selesai');
    const signed = await this.prisma.usulinSignature.count({ where: { usulan_id: inovasiId, tahap } });
    if (signed) throw new ForbiddenException('Penilaian sudah ditandatangani');
    const { columns } = await loadTemplateConfig(this.prisma, tahap);
    const assessmentAnswers = this.filterAnswersByOwner(dto.answers, columns, 'PENILAI');
    const headerIds = new Set((await this.prisma.assessmentQuestion.findMany({ where: { id: { in: assessmentAnswers.map((a) => a.question_id) }, is_header: true }, select: { id: true } })).map((q) => q.id));
    const conclusions = await this.prisma.assessmentQuestion.findMany({ where: { id: { in: assessmentAnswers.map((a) => a.question_id) }, question_title_override: '__FINAL_CONCLUSION__' }, select: { id: true } });
    for (const answer of assessmentAnswers) {
      if (headerIds.has(answer.question_id)) continue;
      if (conclusions.some((question) => question.id === answer.question_id)) {
        const selected = answer.custom_values?.__kesimpulan;
        if (tahap !== 2 || !['Tidak ada inovasi nilai 0', 'Diterima sebagai inovasi, dapat dihargai 0,5', 'Diterima sebagai inovasi percontohan nasional nilai 1', 'Lainnya'].includes(String(selected))) throw new BadRequestException('Pilih kesimpulan Penilaian Akhir');
        if (selected === 'Lainnya' && !String(answer.custom_values?.__kesimpulan_catatan ?? '').trim()) throw new BadRequestException('Catatan kesimpulan Lainnya wajib diisi');
        continue;
      }
      for (const column of columns) {
        if (column.owner === 'SATKER') continue;
        const value = column.type === 'readonly' ? column.defaultValue : answer.custom_values?.[column.key] ?? (column.key === 'jawaban_boolean' ? answer.jawaban_boolean : column.key === 'catatan_string' ? answer.catatan_string : column.key === 'link' ? answer.link : undefined);
        const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim());
        if (column.required && empty) throw new BadRequestException(`Kolom ${column.title} wajib diisi`);
        if (empty) continue;
        if (column.type === 'checkbox' && typeof value !== 'boolean') throw new BadRequestException(`Kolom ${column.title} harus berupa centang`);
        if (column.type !== 'checkbox' && typeof value !== 'string' && typeof value !== 'number') throw new BadRequestException(`Isian ${column.title} tidak valid`);
        if (column.type === 'number' && !Number.isFinite(Number(value))) throw new BadRequestException(`Kolom ${column.title} harus berupa angka`);
        if (column.type === 'score' && (!Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 5)) throw new BadRequestException(`Kolom ${column.title} harus berupa skor 1–5`);
        if (['select', 'radio'].includes(column.type) && !(column.options ?? []).includes(String(value))) throw new BadRequestException(`Pilih opsi yang tersedia pada kolom ${column.title}`);
        if (column.type === 'url') {
          try { const url = new URL(String(value)); if (!['https:', 'http:'].includes(url.protocol)) throw new Error(); }
          catch { throw new BadRequestException(`Kolom ${column.title} harus berupa tautan http/https`); }
        }
        if ((column.type === 'text' || column.type === 'textarea') && this.containsWebLink(String(value))) {
          throw new BadRequestException(`Kolom ${column.title} hanya menerima teks, bukan tautan. Gunakan kolom dengan format Link.`);
        }
        if (column.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(String(value))))) throw new BadRequestException(`Kolom ${column.title} harus berupa tanggal`);
      }
    }
    const ids = assessmentAnswers.map((a) => a.question_id);
    if (tahap === 2) {
      const expected = await this.getStage2QuestionIds(inovasiId);
      if (!ids.length || new Set(ids).size !== ids.length || ids.length !== expected.length || ids.some((id) => !expected.includes(id))) {
        throw new BadRequestException('Simpan seluruh pertanyaan dari Tahap 1 dan tambahan Tahap 2');
      }
    } else {
      const valid = await this.prisma.assessmentQuestion.count({ where: { id: { in: ids }, tahap, is_active: true } });
      if (!ids.length || valid !== ids.length) throw new BadRequestException('Pertanyaan tidak sesuai tahap');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${inovasiId} FOR UPDATE`;
      const latest = await tx.inovasi.findUnique({ where: { id: inovasiId }, select: { status: true, status_tahap2: true } });
      if (!latest || (tahap === 2 ? latest.status_tahap2 : latest.status) === StatusInovasi.PERBAIKAN) {
        throw new ForbiddenException('Usulan sedang menunggu perbaikan Satker. Reviewer belum dapat mengedit penilaian.');
      }
      await tx.assessmentAnswer.deleteMany({
        where: { inovasi_id: inovasiId, tahap, source: 'PENILAI' },
      });

      if (assessmentAnswers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: assessmentAnswers.map((a) => ({
            inovasi_id: inovasiId,
            tahap,
            source: 'PENILAI',
            question_id: a.question_id,
            jawaban_boolean: a.jawaban_boolean,
            catatan_string: a.catatan_string,
            link: a.link,
            custom_values: a.custom_values ?? {},
          })),
        });
      }

      return tx.inovasi.findUnique({
        where: { id: inovasiId },
        include: this.includeConfig,
      });
    });
  }

  async updateAssessmentAnswers(
    id: number,
    dto: UpdateAssessmentAnswersDto,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    if (user.role !== 'UNIT') return this.updateAssessmentByPenilai(id, { answers: dto.assessment_answers }, user, 1);
    const { columns } = await loadTemplateConfig(this.prisma, 1);
    const assessmentAnswers = this.filterAnswersByOwner(dto.assessment_answers, columns, 'SATKER');
    await this.validateSelfAssessmentSubmission(assessmentAnswers);
    await this.enforceSatkerLocks(assessmentAnswers, id);
    await this.validateUniqueSupportLinks(this.prisma, assessmentAnswers);
    const existing = await this.prisma.inovasi.findUnique({
      where: { id },
      select: { id: true, user_id: true, satker_id: true, status: true, catatan_perbaikan: true },
    });

    if (!existing) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    if (user.role === 'UNIT' && existing.user_id !== user.sub) {
      throw new ForbiddenException('Anda tidak memiliki akses ke inovasi ini');
    }

    if (!['PENDING', 'PERBAIKAN'].includes(existing.status)) {
      throw new ForbiddenException(
        'Jawaban assessment hanya dapat diubah jika status PENDING atau PERBAIKAN',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
      const latest = await tx.inovasi.findUnique({ where: { id }, select: { status: true, user_id: true, satker_id: true } });
      if (!latest || latest.user_id !== user.sub || latest.satker_id !== user.satker_id
        || !['PENDING', 'PERBAIKAN'].includes(latest.status)) {
        throw new ForbiddenException('Jawaban assessment sudah tidak dapat diubah oleh akun ini.');
      }
      const revisionLog = existing.status === StatusInovasi.PERBAIKAN
        ? await this.ensureOpenRevisionLog(tx, { id, catatan_perbaikan: existing.catatan_perbaikan })
        : null;
      await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1, source: 'SATKER' } });
      if (existing.status === 'PERBAIKAN') {
        await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1, source: 'PENILAI' } });
      }

      if (assessmentAnswers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: assessmentAnswers.map((a) => ({
            inovasi_id: id,
            question_id: a.question_id,
            source: 'SATKER',
            jawaban_boolean: a.jawaban_boolean,
            catatan_string: a.catatan_string,
            link: a.link,
            custom_values: a.custom_values ?? {},
          })),
        });
      }

      return tx.inovasi.findUnique({
        where: { id },
        include: this.includeConfig,
      });
    });
  }

  async findHasilEvaluasi() {
    return this.prisma.inovasi.findMany({
      where: { status: StatusInovasi.SELESAI_EVALUASI },
      include: this.includeConfig,
      orderBy: { updated_at: 'desc' },
    });
  }

  async generatePdf(id: number, tahap = 1): Promise<{ buffer: Buffer; filename: string }> {
    const inovasi = await this.findOne(id, tahap);
    const { columns, questionTitle, reportHeader } = await loadTemplateConfig(this.prisma, tahap);
    const buffer = await this.buildPdfBuffer({ ...inovasi, ba_columns: columns, ba_question_title: questionTitle, ba_report_header: reportHeader, tahap, usulan_signatures: inovasi.usulan_signatures.filter((s) => s.tahap === tahap) });
    return { buffer, filename: `BA_Tahap_${tahap}_${this.sanitizeFilename(inovasi.judul)}.pdf` };
  }

  private sanitizeFilename(name: string): string {
    return (
      name
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\s+/g, ' ')
        .trim() || 'Inovasi'
    );
  }

  private buildPdfBuffer(inovasi: any): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: (inovasi.ba_columns?.length ?? 3) > 3 ? 'landscape' : 'portrait' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const answers = inovasi.assessment_answers || [];
      const reportHeader = inovasi.ba_report_header || {};
      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 80;
      let y = 36;

      const logoMatch = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/i.exec(reportHeader.logo || '');
      if (logoMatch) {
        try {
          const logo = Buffer.from(logoMatch[2], 'base64');
          doc.image(logo, (pageWidth - 110) / 2, y, { fit: [110, 62], align: 'center', valign: 'center' });
          y += 68;
        } catch { /* Continue rendering the report if a saved logo is unreadable. */ }
      }

      const centeredLine = (value: string, fontSize: number, spacing = 3) => {
        doc.font('Times-Bold').fontSize(fontSize);
        const height = doc.heightOfString(value, { width: contentWidth, align: 'center' });
        doc.text(value, 40, y, { width: contentWidth, align: 'center' });
        y += height + spacing;
      };
      centeredLine('BERITA ACARA', 12);
      centeredLine(reportHeader.title || 'DESK INOVASI IMPLEMENTASI SAKIP', 12);
      if (reportHeader.dateText) centeredLine(reportHeader.dateText, 11, 7);
      doc.moveTo(40, y).lineTo(pageWidth - 40, y).lineWidth(1.5).stroke();
      y += 12;

      const information = [
        ['Unit Utama', 'Ditjen Penanggulangan Penyakit'],
        ['Kantor Pusat / UPT', inovasi.satker?.nama_satker || '-'],
        ['Nama Inovasi', inovasi.judul || '-'],
        ['Deskripsi Inovasi', inovasi.deskripsi_inovasi || '-'],
      ];
      for (const [label, value] of information) {
        doc.font('Times-Roman').fontSize(10);
        const text = `${label} : ${value}`;
        const height = doc.heightOfString(text, { width: contentWidth });
        doc.text(text, 40, y, { width: contentWidth });
        y += height + 3;
      }

      // Tabel evaluasi mengikuti template BA yang aktif.
      const tableBottom = this.drawEvaluationTable(doc, answers, y + 8, inovasi.ba_columns, inovasi.ba_question_title);

      // Tanda tangan.
      this.drawSignatureBlocks(doc, inovasi, tableBottom);

      doc.end();
    });
  }

  private drawEvaluationTable(doc: PDFKit.PDFDocument, answers: any[], startY: number, configured?: any[], _questionTitle = 'Kriteria Penilaian'): number {
    const columns = configured ?? [
      { key: 'jawaban_boolean', title: 'Hasil', type: 'checkbox' },
      { key: 'catatan_string', title: 'Catatan', type: 'textarea' },
      { key: 'link', title: 'Tautan', type: 'url' },
    ];
    if (columns.length > 4) {
      let bottom = startY;
      for (let i = 0; i < columns.length; i += 4) {
        if (i > 0) doc.addPage();
        bottom = this.drawEvaluationTable(doc, answers, i === 0 ? startY : 45, columns.slice(i, i + 4), _questionTitle);
      }
      return bottom;
    }
    const available = doc.page.width - 80;
    const widths = [available * 0.06, available * 0.34, ...columns.map(() => available * 0.60 / columns.length)];
    let y = startY;
    const render = (values: string[], bold = false) => {
      doc.font(bold ? 'Times-Bold' : 'Times-Roman').fontSize(9);
      const height = Math.max(25, ...values.map((v, i) => doc.heightOfString(v || ' ', { width: widths[i] - 8 }) + 10));
      if (y + height > doc.page.height - 45) { doc.addPage(); y = 45; doc.font(bold ? 'Times-Bold' : 'Times-Roman').fontSize(9); }
      let x = 40;
      values.forEach((v, i) => { doc.rect(x, y, widths[i], height).stroke(); doc.text(v || ' ', x + 4, y + 5, { width: widths[i] - 8 }); x += widths[i]; });
      y += height;
    };
    const sectionHeader = (question: any) => render(['No', question.question_title_override || '', ...columns.map((c, index) => question.column_titles?.[index] || '')], true);
    const row = (answer: any, no: string, child: boolean) => {
      if (answer.question?.question_title_override === '__FINAL_CONCLUSION__') {
        const values = answer.custom_values ?? {};
        const conclusion = values.__kesimpulan === 'Lainnya' ? `Lainnya: ${values.__kesimpulan_catatan || ''}` : values.__kesimpulan || 'Belum diisi';
        const text = `${answer.question.pertanyaan}\n${conclusion}`;
        doc.font('Times-Bold').fontSize(10);
        const height = Math.max(40, doc.heightOfString(text, { width: available - 8 }) + 12);
        if (y + height > doc.page.height - 45) { doc.addPage(); y = 45; }
        doc.rect(40, y, available, height).stroke();
        doc.text(text, 44, y + 6, { width: available - 8 });
        y += height;
        return;
      }
      if (answer.question?.is_header) {
        doc.font('Times-Bold').fontSize(10);
        const height = Math.max(25, doc.heightOfString(answer.question.pertanyaan, { width: available - 8 }) + 10);
        if (y + height > doc.page.height - 45) { doc.addPage(); y = 45; doc.font('Times-Bold').fontSize(10); }
        doc.rect(40, y, available, height).fillAndStroke('#e2e8f0', '#000000');
        doc.fillColor('#000000').text(answer.question.pertanyaan, 44, y + 5, { width: available - 8 });
        y += height;
        return;
      }
      render([no, (child ? '    ' : '') + String((answer.custom_values as any)?.__rincian ?? answer.question?.pertanyaan ?? ''), ...columns.map((c) => {
      const value = c.type === 'readonly' ? c.defaultValue : answer.custom_values?.[c.key] ?? answer[c.key];
      return c.type === 'checkbox' ? (value ? 'V' : '') : String(value ?? '');
    })]);
    };
    let sectionNumber = 0;
    answers.filter((a) => !a.question?.parent_id).forEach((parent) => {
      const children = answers.filter((a) => a.question?.parent_id === parent.question_id);
      if (parent.question?.is_header) {
        sectionNumber = 0;
        row(parent, '', false);
        sectionHeader(parent.question);
        children.forEach((child, index) => {
          sectionNumber = index + 1;
          row(child, String(sectionNumber), true);
        });
        return;
      }

      sectionNumber += 1;
      row(parent, String(sectionNumber), false);
      children.forEach((child, index) => row(child, `${sectionNumber}.${String.fromCharCode(97 + index)}`, true));
    });
    return y;
  }

  private drawSignatureBlocks(
    doc: PDFKit.PDFDocument,
    inovasi: any,
    tableBottom: number,
  ) {
    const pageWidth = doc.page.width;
    const marginX = 40;
    const tableWidth = pageWidth - marginX * 2;
    const pageBottom = doc.page.height - 40;

    const width = tableWidth / 2;
    const signatures = inovasi.usulan_signatures || [];
    if (inovasi.tahap !== 2) {
      const ttdGap = 4 * 13.2;
      let y = tableBottom + 45;
      for (let i = 0; i < signatures.length; i += 2) {
        const row = signatures.slice(i, i + 2);
        const roleHeight = Math.max(...row.map((sig: any) => doc.font('Times-Bold').fontSize(11).heightOfString(sig.jabatan || sig.role || '-', { width: width - 20 })));
        const nameHeight = Math.max(...row.map((sig: any) => doc.font('Times-Roman').fontSize(11).heightOfString(sig.nama || sig.user?.nama_lengkap || '-', { width: width - 20 })));
        const blockHeight = roleHeight + ttdGap + nameHeight + 65;
        if (y + blockHeight > pageBottom) { doc.addPage(); y = 60; }
        row.forEach((sig: any, column: number) => {
          const x = marginX + column * width + 10;
          const options = { width: width - 20, align: 'center' as const };
          doc.font('Times-Bold').fontSize(11).text(sig.jabatan || sig.role || '-', x, y, options);
          const imageY = y + roleHeight + 8;
          if (sig.ttd_image) {
            try { doc.image(Buffer.from(sig.ttd_image.replace(/^data:image\/\w+;base64,/, ''), 'base64'), x + (width - 160) / 2, imageY, { fit: [140, ttdGap] }); } catch { /* Preserve space for unreadable legacy images. */ }
          }
          const nameY = imageY + ttdGap + 8;
          doc.font('Times-Roman').fontSize(11).text(sig.nama || sig.user?.nama_lengkap || '-', x, nameY, options);
          doc.fontSize(10).text(`NIP ${sig.nip || '-'}`, x, nameY + nameHeight + 4, options);
        });
        y += blockHeight + 20;
      }
      return;
    }

    const { left, right } = orderFinalSignatureGroups(signatures);
    const columnGroups = [left, right];
    const groupCount = Math.max(left.length, right.length);
    let y = tableBottom + 45;

    for (let index = 0; index < groupCount; index++) {
      const pair = [columnGroups[0][index], columnGroups[1][index]];
      const groupHeights = pair.map((group) => {
        if (!group) return 0;
        return 22 + group.signatures.reduce((total, signature) => {
          const name = signature.nama || signature.user?.nama_lengkap || '-';
          const nameHeight = doc.font('Times-Roman').fontSize(11).heightOfString(name, { width: width - 20 });
          return total + Math.max(62, 48 + nameHeight + 17);
        }, 0) + 8;
      });
      const blockHeight = Math.max(...groupHeights, 62);
      if (y + blockHeight > pageBottom) { doc.addPage(); y = 60; }

      pair.forEach((group, column) => {
        if (!group) return;
        const x = marginX + column * width + 10;
        const options = { width: width - 20, align: 'center' as const };
        doc.font('Times-Bold').fontSize(11).text(`${group.role} :`, x, y, options);
        let memberY = y + 20;
        for (const signature of group.signatures) {
          const image = signature.ttd_image;
          if (image) {
            try {
              doc.image(Buffer.from(image.replace(/^data:image\/\w+;base64,/, ''), 'base64'), x + (width - 140) / 2, memberY, { fit: [120, 42] });
            } catch { /* Preserve space for unreadable legacy images. */ }
          }
          const nameY = memberY + 44;
          const name = signature.nama || signature.user?.nama_lengkap || '-';
          doc.font('Times-Roman').fontSize(11).text(name, x, nameY, options);
          const nameHeight = doc.fontSize(11).heightOfString(name, { width: width - 20 });
          doc.fontSize(10).text(`NIP ${signature.nip || '-'}`, x, nameY + nameHeight + 3, options);
          memberY += Math.max(62, 48 + nameHeight + 17);
        }
      });
      y += blockHeight + 16;
    }
  }

  async sign(id: number, dto: SignInovasiDto, user: { sub: number }, tahap = 1) {
    this.validateTahap(tahap);
    if (tahap === 1 && !['LOLOS', 'TIDAK_LOLOS'].includes(dto.keputusan ?? '')) throw new BadRequestException('Pilih Lolos atau Tidak Lolos');
    if (tahap === 2 && !dto.nama?.trim()) throw new BadRequestException('Isi nama penanda tangan');
    if (!dto.nip.trim()) throw new BadRequestException('NIP wajib diisi');
    if (!/^\d+$/.test(dto.nip)) throw new BadRequestException('NIP hanya boleh berisi angka');
    if (!dto.jabatan.trim()) throw new BadRequestException('Isi peran penanda tangan');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
      const inovasi = await tx.inovasi.findUnique({
        where: { id },
        include: { penilai: { select: { id: true } }, penilai_tahap2: { select: { id: true } }, usulan_signatures: { where: { tahap }, select: { id: true } } },
      });

      if (!inovasi) {
        throw new NotFoundException('Inovasi tidak ditemukan');
      }

      const signer = await tx.user.findUniqueOrThrow({ where: { id: user.sub }, select: { nama_lengkap: true, role: true, satker_id: true } });
      const isUnitSigner = tahap === 2 && signer.role === 'UNIT' && signer.satker_id === inovasi.satker_id;
      const stageStatus = tahap === 2 ? inovasi.status_tahap2 : inovasi.status;
      if (!isUnitSigner && stageStatus === StatusInovasi.PERBAIKAN) {
        throw new ForbiddenException('Usulan sedang menunggu perbaikan Satker. Reviewer belum dapat menandatangani penilaian.');
      }
      const assigned = tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai;
      if (!isUnitSigner && !assigned.some((p) => p.id === user.sub)) throw new ForbiddenException('Anda tidak berhak menandatangani inovasi ini');
      if (tahap === 2) {
        const reviewerRoles = ['Dalnis Itjen', 'Ketua Tim Itjen', 'Anggota Tim Itjen', 'Biro Perencanaan', 'Ketua Tim Kerja Monev I Biro Perencanaan', 'Ketua Tim Kerja Marvel'];
        const units = await tx.satker.findMany({ select: { id: true, nama_satker: true } });
        if (isUnitSigner) {
          const organization = units.find((unit) => unit.id === signer.satker_id);
          const organizationName = organization?.nama_satker?.trim() ?? '';
          const ownRole = /^biro perencanaan$/i.test(organizationName)
            ? 'Biro Perencanaan'
            : /direktorat/i.test(organizationName)
              ? 'Petugas Unit Eselon 1'
              : `Petugas BKK (${organizationName})`;
          if (dto.jabatan !== ownRole) throw new BadRequestException('Pilih peran sesuai organisasi pada akun Anda');
        } else if (!reviewerRoles.includes(dto.jabatan)) {
          throw new BadRequestException('Reviewer hanya dapat memilih peran penilai');
        }
      }
      if (!isUnitSigner && !['LOLOS', 'TIDAK_LOLOS'].includes(dto.keputusan ?? '')) throw new BadRequestException('Pilih Lolos atau Tidak Lolos');
      if (tahap === 2 && inovasi.status !== StatusInovasi.SELESAI_EVALUASI) throw new BadRequestException('Tahap 1 belum selesai');
      if (tahap === 2 && !inovasi.usulan_signatures.length) {
        const expected = await this.getStage2QuestionIds(id, tx);
        const saved = await tx.assessmentAnswer.findMany({ where: { inovasi_id: id, tahap: 2, source: 'PENILAI' }, select: { question_id: true } });
        const savedIds = new Set(saved.map((answer) => answer.question_id));
        if (!expected.length || expected.some((questionId) => !savedIds.has(questionId))) throw new BadRequestException('Simpan seluruh jawaban Tahap 2 sebelum menandatangani');
      }
      // Cek apakah user ini adalah penilai yang ter-assign pada usulan ini
      const isAssignedPenilai = (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).some((p) => p.id === user.sub);
      if (!isAssignedPenilai && !isUnitSigner) {
        throw new ForbiddenException(
          'Anda tidak ditugaskan sebagai penilai inovasi ini',
        );
      }

      // Cek apakah user sudah pernah menandatangani usulan ini
      const existingSignature = await tx.usulinSignature.findFirst({
        where: {
          usulan_id: id,
          user_id: user.sub,
          tahap,
        },
      });

      if (existingSignature) {
        throw new ForbiddenException('Anda sudah menandatangani usulan ini');
      }

      // Buat entri tanda tangan baru di usulan_signatures
      await tx.usulinSignature.create({
        data: {
          usulan_id: id,
          user_id: user.sub,
          tahap,
          role: dto.jabatan, // menggunakan jabatan sebagai role
          nama: tahap === 2 ? dto.nama!.trim() : signer.nama_lengkap,
          nip: dto.nip,
          jabatan: dto.jabatan,
          ttd_image: dto.signature_data,
          keputusan: isUnitSigner ? null : dto.keputusan,
        },
      });

      // Hitung total tanda tangan dan total penilai yang ter-assign
      const totalSignatures = await tx.usulinSignature.count({
        where: { usulan_id: id, tahap, user_id: { in: assigned.map((p) => p.id) } },
      });
      const totalAssigned = (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).length;

      // Jika total tanda tangan sama dengan total penilai yang ter-assign,ubah status menjadi SELESAI_EVALUASI
      if (totalAssigned > 0 && totalSignatures >= totalAssigned) {
        await tx.inovasi.update({
          where: { id },
          data: tahap === 2 ? { status_tahap2: StatusInovasi.SELESAI_EVALUASI } : { status: StatusInovasi.SELESAI_EVALUASI },
        });
      }

      return tx.inovasi.findUnique({
        where: { id },
        include: this.includeConfig,
      });
    });
  }

  async sendBackForPerbaikan(id: number, catatan_perbaikan: string, user: any) {
    const note = typeof catatan_perbaikan === 'string' ? catatan_perbaikan.trim() : '';
    if (!note) throw new BadRequestException('Catatan perbaikan wajib diisi');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
      const inovasi = await tx.inovasi.findUnique({ where: { id }, include: { penilai: { select: { id: true } } } });
      if (!inovasi) throw new NotFoundException('Inovasi tidak ditemukan');
      if (!inovasi.penilai.some((p) => p.id === user.sub)) throw new ForbiddenException('Anda tidak ditugaskan sebagai penilai inovasi ini');
      if (inovasi.status !== StatusInovasi.PENDING) {
        throw new ForbiddenException('Usulan hanya dapat dikembalikan saat menunggu penilaian reviewer.');
      }
      const snapshot = await this.captureRevisionSnapshot(tx, id);
      await tx.inovasiRevisionLog.create({
        data: { inovasi_id: id, requested_by_id: user.sub, catatan_perbaikan: note, snapshot },
      });
      return tx.inovasi.update({
        where: { id },
        data: { status: StatusInovasi.PERBAIKAN, catatan_perbaikan: note },
        include: this.includeConfig,
      });
    });
  }

  async sendBackForPerbaikanBulk(
    inovasiIds: number[],
    catatan_perbaikan: string,
    user: { sub: number; role: string },
  ) {
    if (user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Hanya Super Admin yang dapat mengembalikan usulan secara massal.');
    }
    const note = typeof catatan_perbaikan === 'string' ? catatan_perbaikan.trim() : '';
    if (!note) throw new BadRequestException('Catatan perbaikan wajib diisi.');
    if (note.length > 2000) throw new BadRequestException('Catatan perbaikan maksimal 2.000 karakter.');
    if (!Array.isArray(inovasiIds) || !inovasiIds.length || inovasiIds.length > 200
      || inovasiIds.some((id) => !Number.isInteger(id) || id < 1)
      || new Set(inovasiIds).size !== inovasiIds.length) {
      throw new BadRequestException('Pilih 1 sampai 200 usulan yang valid.');
    }

    return this.prisma.$transaction(async (tx) => {
      // Lock in a stable order to avoid concurrent bulk actions changing the same proposals.
      for (const id of [...inovasiIds].sort((left, right) => left - right)) {
        const rows = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
        if (!rows.length) throw new NotFoundException(`Usulan #${id} tidak ditemukan.`);
      }

      const proposals = await tx.inovasi.findMany({
        where: { id: { in: inovasiIds } },
        select: { id: true, status: true },
      });
      const notReturnable = proposals.filter((proposal) => proposal.status !== StatusInovasi.PENDING);
      if (notReturnable.length) {
        throw new BadRequestException(
          `Hanya usulan berstatus sedang direview yang dapat dikembalikan. Periksa usulan: ${notReturnable.map(({ id }) => `#${id}`).join(', ')}.`,
        );
      }

      const revisionLogs: Prisma.InovasiRevisionLogCreateManyInput[] = [];
      for (const id of inovasiIds) {
        revisionLogs.push({
          inovasi_id: id,
          requested_by_id: user.sub,
          catatan_perbaikan: note,
          snapshot: await this.captureRevisionSnapshot(tx, id),
        });
      }
      await tx.inovasiRevisionLog.createMany({ data: revisionLogs });

      const updated = await tx.inovasi.updateMany({
        where: { id: { in: inovasiIds }, status: StatusInovasi.PENDING },
        data: { status: StatusInovasi.PERBAIKAN, catatan_perbaikan: note },
      });
      if (updated.count !== inovasiIds.length) {
        throw new BadRequestException('Sebagian usulan berubah saat diproses. Muat ulang daftar lalu coba lagi.');
      }

      return { updated: updated.count, inovasi_ids: inovasiIds, catatan_perbaikan: note };
    });
  }

  async getSatkerSubmissionSummary(
    user: { role: string },
    tahun: number,
    tahap = 1,
  ) {
    if (!['SUPER_ADMIN', 'REVIEWER'].includes(user.role)) {
      throw new ForbiddenException('Anda tidak memiliki akses ke rekap usulan satker.');
    }
    if (![1, 2].includes(tahap)) {
      throw new BadRequestException('Tahap penilaian tidak valid.');
    }

    const periodStart = new Date(Date.UTC(tahun, 0, 1));
    const periodEnd = new Date(Date.UTC(tahun + 1, 0, 1));
    const where: Prisma.InovasiWhereInput = {
      status: tahap === 2 ? StatusInovasi.SELESAI_EVALUASI : { not: StatusInovasi.DRAFT },
      submitted_at: { gte: periodStart, lt: periodEnd },
    };
    const revisionWhere: Prisma.InovasiWhereInput = {
      ...where,
      ...(tahap === 2
        ? { status_tahap2: StatusInovasi.PERBAIKAN }
        : { status: StatusInovasi.PERBAIKAN }),
    };

    const [submissionGroups, revisionGroups] = await Promise.all([
      this.prisma.inovasi.groupBy({
        by: ['satker_id'],
        where,
        _count: { _all: true },
      }),
      this.prisma.inovasi.groupBy({
        by: ['satker_id'],
        where: revisionWhere,
        _count: { _all: true },
      }),
    ]);

    const satkerIds = submissionGroups.map(({ satker_id }) => satker_id);
    if (satkerIds.length === 0) return [];

    const satkers = await this.prisma.satker.findMany({
      where: { id: { in: satkerIds } },
      select: { id: true, nama_satker: true },
    });
    const satkerNames = new Map(satkers.map(({ id, nama_satker }) => [id, nama_satker]));
    const revisionsBySatker = new Map(
      revisionGroups.map(({ satker_id, _count }) => [satker_id, _count._all]),
    );

    return submissionGroups
      .map(({ satker_id, _count }) => ({
        satker_id,
        nama_satker: satkerNames.get(satker_id) ?? 'Satker tidak diketahui',
        jumlah_usulan: _count._all,
        jumlah_perlu_perbaikan: revisionsBySatker.get(satker_id) ?? 0,
      }))
      .sort((a, b) => b.jumlah_usulan - a.jumlah_usulan || a.nama_satker.localeCompare(b.nama_satker, 'id'));
  }

  async getStats(user: {
    sub: number;
    role: string;
    satker_id?: number | null;
  }, tahun = new Date().getFullYear()) {
    const shouldFilterBySatker = user.role === 'UNIT' && !!user.satker_id;
    const periodStart = new Date(Date.UTC(tahun, 0, 1));
    const periodEnd = new Date(Date.UTC(tahun + 1, 0, 1));
    const where: Prisma.InovasiWhereInput = {
      ...(shouldFilterBySatker ? { satker_id: user.satker_id! } : {}),
      status: { not: StatusInovasi.DRAFT },
      submitted_at: { gte: periodStart, lt: periodEnd },
    };

    const [
      total_usulan,
      total_pending,
      total_approved,
      total_rejected,
      total_selesai_evaluasi,
      chartStatus,
      chartKriteria,
      chartTahapRows,
      baQuestions,
      baSatkerAnswers,
      baConfig,
    ] = await Promise.all([
      this.prisma.inovasi.count({ where }),
      this.prisma.inovasi.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.inovasi.count({ where: { ...where, status: 'APPROVED' } }),
      this.prisma.inovasi.count({ where: { ...where, status: 'REJECTED' } }),
      this.prisma.inovasi.count({
        where: { ...where, status: 'SELESAI_EVALUASI' },
      }),
      this.prisma.inovasi.findMany({
        where,
        select: { jenis_inovasi: true, jenis_inovasi_pilihan: true },
      }),
      this.prisma.inovasi.groupBy({
        by: ['kriteria_inovasi'],
        where,
        _count: { id: true },
        orderBy: { kriteria_inovasi: 'asc' },
      }),
      this.prisma.inovasi.findMany({
        where,
        select: {
          submitted_at: true,
          status: true,
          status_tahap2: true,
          penilai: { select: { id: true } },
          penilai_tahap2: { select: { id: true } },
          usulan_signatures: { select: { user_id: true, tahap: true, keputusan: true } },
        },
      }),
      this.prisma.assessmentQuestion.findMany({
        where: { tahap: 1, is_active: true },
        select: { id: true, parent_id: true, pertanyaan: true, is_header: true, urutan: true },
      }),
      this.prisma.assessmentAnswer.findMany({
        where: { tahap: 1, source: 'SATKER', inovasi: where },
        select: { inovasi_id: true, question_id: true, jawaban_boolean: true, custom_values: true },
      }),
      loadTemplateConfig(this.prisma, 1),
    ]);

    const jenisCounts = new Map<string, number>();
    for (const item of chartStatus) {
      const choices = item.jenis_inovasi_pilihan.length ? item.jenis_inovasi_pilihan : [item.jenis_inovasi];
      for (const choice of new Set(choices)) {
        const label = choice || 'Lainnya';
        jenisCounts.set(label, (jenisCounts.get(label) ?? 0) + 1);
      }
    }

    const chartTahap = [
      { label: 'Tahap 1', sedang_direview: 0, menunggu_ttd: 0, perbaikan: 0, lolos: 0, tidak_lolos: 0 },
      { label: 'Tahap 2', sedang_direview: 0, menunggu_ttd: 0, perbaikan: 0, lolos: 0, tidak_lolos: 0 },
    ];
    let totalPerbaikanUnik = 0;
    const timelineByMonth = new Map<string, {
      bulan: string;
      total_usulan: number;
      lolos_seleksi_awal: number;
      lolos_penilaian_akhir: number;
    }>();
    for (let month = 1; month <= 12; month++) {
      const key = `${tahun}-${String(month).padStart(2, '0')}`;
      timelineByMonth.set(key, {
        bulan: key,
        total_usulan: 0,
        lolos_seleksi_awal: 0,
        lolos_penilaian_akhir: 0,
      });
    }

    for (const item of chartTahapRows) {
      const monthKey = item.submitted_at?.toISOString().slice(0, 7);
      const monthStats = monthKey ? timelineByMonth.get(monthKey) : undefined;
      if (monthStats) {
        monthStats.total_usulan++;
        if (statusPenilaian(item.status, item.penilai, item.usulan_signatures, 1) === 'LOLOS') {
          monthStats.lolos_seleksi_awal++;
        }
      }

      const tahap2Aktif = item.status === StatusInovasi.SELESAI_EVALUASI &&
        (item.penilai_tahap2.length > 0 || item.usulan_signatures.some((signature) => signature.tahap === 2));
      if (tahap2Aktif && monthStats && statusPenilaian(item.status_tahap2, item.penilai_tahap2, item.usulan_signatures, 2) === 'LOLOS') {
        monthStats.lolos_penilaian_akhir++;
      }
      const stageInputs = [
        { tahap: 1, status: item.status, penilai: item.penilai, active: true },
        {
          tahap: 2,
          status: item.status_tahap2,
          penilai: item.penilai_tahap2,
          active: tahap2Aktif,
        },
      ];
      let perluPerbaikan = item.status === StatusInovasi.PERBAIKAN ||
        (item.status === StatusInovasi.SELESAI_EVALUASI && item.status_tahap2 === StatusInovasi.PERBAIKAN);
      for (const stage of stageInputs) {
        if (!stage.active) continue;
        const summary = chartTahap[stage.tahap - 1];
        const status = statusPenilaian(stage.status, stage.penilai, item.usulan_signatures, stage.tahap);
        if (status === 'LOLOS') summary.lolos++;
        else if (status === 'TIDAK_LOLOS') summary.tidak_lolos++;
        else if (status === 'PERBAIKAN') {
          summary.perbaikan++;
          perluPerbaikan = true;
        }
        else if (status === 'SEDANG_DIREVIEW') summary.sedang_direview++;
        else if (status === 'MENUNGGU_TTD') summary.menunggu_ttd++;
        else summary.sedang_direview++;
      }
      if (perluPerbaikan) totalPerbaikanUnik++;
    }

    return {
      summary_cards: {
        total_usulan,
        total_pending,
        total_approved,
        total_rejected,
        total_perbaikan: totalPerbaikanUnik,
        total_selesai_evaluasi,
      },
      chart_status: Array.from(jenisCounts, ([jenis_inovasi, total]) => ({ jenis_inovasi, total }))
        .sort((a, b) => a.jenis_inovasi.localeCompare(b.jenis_inovasi)),
      chart_kriteria: chartKriteria.map((item) => ({
        kriteria_inovasi: item.kriteria_inovasi,
        total: item._count.id,
      })),
      chart_kriteria_seleksi_awal: baCriteriaStats(baQuestions, baSatkerAnswers, baConfig.columns.find((column) => column.type === 'checkbox')?.key),
      chart_timeline: Array.from(timelineByMonth.values()).map((item) => ({
        ...item,
        persentase_seleksi_awal: item.total_usulan
          ? Math.round((item.lolos_seleksi_awal / item.total_usulan) * 1000) / 10
          : 0,
        persentase_penilaian_akhir: item.total_usulan
          ? Math.round((item.lolos_penilaian_akhir / item.total_usulan) * 1000) / 10
          : 0,
      })),
      chart_tahap: chartTahap,
    };
  }
}
