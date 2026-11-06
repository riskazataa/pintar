import { hasilPenilaian, statusPenilaian } from './hasil-penilaian';
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StatusInovasi } from '@prisma/client';
import { CreateInovasiDto } from './dto/create-inovasi.dto';
import { UpdateInovasiDto } from './dto/update-inovasi.dto';
import { QueryInovasiDto } from './dto/query-inovasi.dto';
import { UpdateAssessmentPenilaiDto } from './dto/update-assessment-penilai.dto';
import { UpdateAssessmentAnswersDto } from './dto/update-assessment-answers.dto';
import { SignInovasiDto } from './dto/sign-inovasi.dto';
import { SaveInovasiDraftDto } from './dto/save-inovasi-draft.dto';
import { loadTemplateConfig } from '../assessment/template-config';
import { composeStage2Answers } from './stage2-assessment';
import { orderFinalSignatureGroups } from './final-signature-order';
import { baCriteriaStats } from './ba-criteria-stats';

@Injectable()
export class InovasiService {
  constructor(private readonly prisma: PrismaService) {}

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
    const { search, satker_id, status, start_date, end_date, assignedToMe, tahun } =
      query;

    const where: Prisma.InovasiWhereInput = {};
    if (tahun) where.tahun = tahun;

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
    if (assignedToMe && user.sub) {
      if (query.tahap === 2) where.penilai_tahap2 = { some: { id: user.sub } };
      else where.penilai = { some: { id: user.sub } };
    }

    if (status) {
      if (status === StatusInovasi.DRAFT && user.role !== 'UNIT') where.id = -1;
      else if (query.tahap === 2) where.status_tahap2 = status;
      else where.status = status;
    }

    if (search) {
      where.OR = [
        { judul: { contains: search, mode: 'insensitive' } },
        { pic_nama: { contains: search, mode: 'insensitive' } },
      ];
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

  private getStage1Answers(answers: any[], includeReviewer: boolean) {
    const satkerAnswers = answers.filter((answer) => answer.tahap === 1 && (answer.source ?? 'SATKER') === 'SATKER');
    if (!includeReviewer) return satkerAnswers;

    const reviewerAnswers = answers.filter((answer) => answer.tahap === 1 && answer.source === 'PENILAI');
    const reviewerByQuestion = new Map<number, any>();
    reviewerAnswers.forEach((answer) => reviewerByQuestion.set(answer.question_id, answer));
    const satkerQuestionIds = new Set(satkerAnswers.map((answer) => answer.question_id));
    return [
      ...satkerAnswers.map((answer) => {
        const reviewerAnswer = reviewerByQuestion.get(answer.question_id);
        return reviewerAnswer
          ? { ...answer, ...reviewerAnswer, question: reviewerAnswer.question ?? answer.question }
          : answer;
      }),
      ...reviewerAnswers.filter((answer) => !satkerQuestionIds.has(answer.question_id)),
    ];
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
      include: this.includeConfig,
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
      const stage1Answers = this.orderAssessmentAnswers(this.getStage1Answers(inovasi.assessment_answers, true).filter((answer) => !hiddenStage1Ids.has(answer.question_id)));
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
    inovasi.assessment_answers = this.orderAssessmentAnswers(this.getStage1Answers(
      inovasi.assessment_answers,
      view === 'evaluation' || (view !== 'self-assessment' && user?.role !== 'UNIT'),
    ));
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
      hasil_penilaian: hasilPenilaian(inovasi.penilai, inovasi.usulan_signatures),
      hasil_penilaian_tahap1: hasilPenilaian(inovasi.penilai, allSignatures, 1),
      hasil_penilaian_tahap2: hasilPenilaian(inovasi.penilai_tahap2, allSignatures, 2),
      assigned_users: assignedUsers,
      signatures: signatures,
    };
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
    if (!Array.isArray(penilaiIds) || !penilaiIds.length || penilaiIds.some((id) => !Number.isInteger(id)) || new Set(penilaiIds).size !== penilaiIds.length) throw new BadRequestException('Pilih penilai yang valid');
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id: inovasiId },
      include: {
        penilai: { select: { id: true } },
        penilai_tahap2: { select: { id: true } },
      },
    });
    if (!inovasi) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: penilaiIds }, role: 'REVIEWER', status_registrasi: 'APPROVED' },
      select: { id: true },
    });

    if (users.length !== penilaiIds.length) {
      throw new NotFoundException('Beberapa user penilai tidak ditemukan');
    }

    if (tahap === 2 && inovasi.status !== StatusInovasi.SELESAI_EVALUASI) throw new BadRequestException('Tahap 1 belum selesai');
    const currentReviewerIds = new Set(
      (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).map((reviewer) => reviewer.id),
    );
    const requestedReviewerIds = new Set(penilaiIds);
    const signatures = await this.prisma.usulinSignature.findMany({
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
    return this.prisma.inovasi.update({
      where: { id: inovasiId },
      data: {
        [tahap === 2 ? "penilai_tahap2" : "penilai"]: { set: penilaiIds.map((id) => ({ id })) },
      },
      include: this.includeConfig,
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

    const assessmentAnswers = this.normalizeDraftAnswers(dto);
    await this.validateQuestionStage(assessmentAnswers, 1);
    await this.enforceSatkerLocks(assessmentAnswers);
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

    const assessmentAnswers = this.normalizeDraftAnswers(dto);
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
      await tx.inovasi.update({ where: { id }, data });
      if (dto.assessment_answers !== undefined) {
        await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1, source: 'SATKER' } });
        if (assessmentAnswers.length) {
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
      }
      return tx.inovasi.findUnique({ where: { id }, include: this.includeConfig });
    });
  }

  async create(
    dto: CreateInovasiDto,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    const assessment_answers = dto.assessment_answers;
    await this.validateQuestionStage(assessment_answers ?? [], 1);
    if (user.role === 'UNIT') await this.enforceSatkerLocks(assessment_answers ?? [], undefined);
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

    const assessment_answers = (dto as any).assessment_answers;
    if (user.role === 'UNIT') await this.enforceSatkerLocks(assessment_answers ?? [], id);
    await this.validateQuestionStage(assessment_answers ?? [], 1);
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

    return this.prisma.$transaction(async (tx) => {
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

    const isPenilai = (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).some((p) => p.id === user.sub);
    if (!isPenilai) {
      throw new ForbiddenException(
        'Anda tidak ditugaskan sebagai penilai inovasi ini',
      );
    }

    if (tahap === 2 && inovasi.status !== StatusInovasi.SELESAI_EVALUASI) throw new BadRequestException('Tahap 1 belum selesai');
    const signed = await this.prisma.usulinSignature.count({ where: { usulan_id: inovasiId, tahap } });
    if (signed) throw new ForbiddenException('Penilaian sudah ditandatangani');
    const { columns } = await loadTemplateConfig(this.prisma, tahap);
    const headerIds = new Set((await this.prisma.assessmentQuestion.findMany({ where: { id: { in: dto.answers.map((a) => a.question_id) }, is_header: true }, select: { id: true } })).map((q) => q.id));
    const conclusions = await this.prisma.assessmentQuestion.findMany({ where: { id: { in: dto.answers.map((a) => a.question_id) }, question_title_override: '__FINAL_CONCLUSION__' }, select: { id: true } });
    for (const answer of dto.answers) {
      if (headerIds.has(answer.question_id)) continue;
      if (conclusions.some((question) => question.id === answer.question_id)) {
        const selected = answer.custom_values?.__kesimpulan;
        if (tahap !== 2 || !['Tidak ada inovasi nilai 0', 'Diterima sebagai inovasi, dapat dihargai 0,5', 'Diterima sebagai inovasi percontohan nasional nilai 1', 'Lainnya'].includes(String(selected))) throw new BadRequestException('Pilih kesimpulan Penilaian Akhir');
        if (selected === 'Lainnya' && !String(answer.custom_values?.__kesimpulan_catatan ?? '').trim()) throw new BadRequestException('Catatan kesimpulan Lainnya wajib diisi');
        continue;
      }
      for (const column of columns) {
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
        if (column.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(String(value))))) throw new BadRequestException(`Kolom ${column.title} harus berupa tanggal`);
      }
    }
    const ids = dto.answers.map((a) => a.question_id);
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
      await tx.assessmentAnswer.deleteMany({
        where: { inovasi_id: inovasiId, tahap, source: 'PENILAI' },
      });

      if (dto.answers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: dto.answers.map((a) => ({
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
    await this.validateQuestionStage(dto.assessment_answers, 1);
    await this.enforceSatkerLocks(dto.assessment_answers, id);
    const existing = await this.prisma.inovasi.findUnique({
      where: { id },
      select: { id: true, user_id: true, satker_id: true, status: true },
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
      await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1, source: 'SATKER' } });
      if (existing.status === 'PERBAIKAN') {
        await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1, source: 'PENILAI' } });
      }

      if (dto.assessment_answers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: dto.assessment_answers.map((a) => ({
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
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id },
      include: { penilai: { select: { id: true } } },
    });

    if (!inovasi) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    const isPenilai = inovasi.penilai.some((p) => p.id === user.sub);
    if (!isPenilai) {
      throw new ForbiddenException(
        'Anda tidak ditugaskan sebagai penilai inovasi ini',
      );
    }

    return this.prisma.inovasi.update({
      where: { id },
      data: {
        status: StatusInovasi.PERBAIKAN,
        catatan_perbaikan,
      },
      include: this.includeConfig,
    });
  }

  async getStats(user: {
    sub: number;
    role: string;
    satker_id?: number | null;
  }, tahun = new Date().getFullYear()) {
    const shouldFilterBySatker = user.role === 'UNIT' && !!user.satker_id;
    const where: Prisma.InovasiWhereInput = shouldFilterBySatker
      ? { satker_id: user.satker_id!, tahun, status: { not: StatusInovasi.DRAFT } }
      : { tahun, status: { not: StatusInovasi.DRAFT } };

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
          created_at: true,
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
      const monthKey = item.created_at.toISOString().slice(0, 7);
      const monthStats = timelineByMonth.get(monthKey);
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
