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
import { loadTemplateConfig } from '../assessment/template-config';
import { composeStage2Answers } from './stage2-assessment';

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
          question: { select: { id: true, pertanyaan: true, is_header: true, satker_locked: true, question_title_override: true, column_titles: true, parent_id: true, tahap: true } },
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
    const { search, satker_id, status, start_date, end_date, assignedToMe } =
      query;

    const where: Prisma.InovasiWhereInput = {};

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
      if (query.tahap === 2) where.status_tahap2 = status;
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

  async findOne(id: number, tahap = 1) {
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
      const saved = inovasi.assessment_answers.filter((a) => a.tahap === 2);
      const questions = signatures.length
        ? saved.filter((answer) => answer.question.tahap === 2).map((answer) => answer.question)
        : await this.prisma.assessmentQuestion.findMany({ where: { tahap: 2, is_active: true }, orderBy: { id: 'asc' } });
      const answers = composeStage2Answers(inovasi.assessment_answers.filter((a) => a.tahap === 1), saved, questions);
      return {
        ...inovasi, status: inovasi.status_tahap2, penilai: inovasi.penilai_tahap2,
        assigned_users: inovasi.penilai_tahap2.map((p) => ({ id: p.id, nama: p.nama_lengkap })),
        signatures,
        usulan_signatures: signatures,
        hasil_penilaian: hasilPenilaian(inovasi.penilai_tahap2, signatures, 2),
        assessment_answers: answers,
        requires_assessment_save: !signatures.length && answers.some((answer) => !saved.some((item) => item.question_id === answer.question_id)),
      };
    }
    const allSignatures = inovasi.usulan_signatures;
    inovasi.assessment_answers = inovasi.assessment_answers.filter((a) => a.tahap === 1);
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
    const questions = await this.prisma.assessmentQuestion.findMany({ where: { id: { in: answers.map((a) => a.question_id) }, OR: [{ satker_locked: true }, { is_header: true }] }, select: { id: true } });
    const saved = inovasiId ? await this.prisma.assessmentAnswer.findMany({ where: { inovasi_id: inovasiId, tahap: 1 } }) : [];
    for (const answer of answers) {
      if (!questions.some((q) => q.id === answer.question_id)) continue;
      const prior = saved.find((a) => a.question_id === answer.question_id);
      Object.assign(answer, { jawaban_boolean: prior?.jawaban_boolean ?? false, catatan_string: prior?.catatan_string ?? '', link: prior?.link ?? '', custom_values: prior?.custom_values ?? {} });
    }
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
      tahun: dto.tahun,
      jenis_inovasi: dto.jenis_inovasi,
      jenis_inovasi_pilihan: dto.jenis_inovasi_pilihan?.length ? dto.jenis_inovasi_pilihan : [dto.jenis_inovasi],
      jenis_inovasi_lainnya: dto.jenis_inovasi_lainnya,
      kriteria_inovasi: dto.kriteria_inovasi,
      link_data_dukung: dto.link_data_dukung,
      pic_nama: dto.pic_nama,
      pic_telp: dto.pic_telp,
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

    if (existing.status !== 'PERBAIKAN') {
      throw new ForbiddenException(
        'Inovasi hanya dapat diubah jika statusnya PERBAIKAN',
      );
    }

    if (user.role === 'UNIT' && existing.satker_id !== user.satker_id) {
      throw new ForbiddenException('Anda tidak memiliki akses ke inovasi ini');
    }

    const assessment_answers = (dto as any).assessment_answers;
    if (user.role === 'UNIT') await this.enforceSatkerLocks(assessment_answers ?? [], id);
    await this.validateQuestionStage(assessment_answers ?? [], 1);
    const inovasiData: Record<string, any> = {};
    if (dto.judul !== undefined) inovasiData.judul = dto.judul;
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

    inovasiData.status = StatusInovasi.PENDING;
    inovasiData.catatan_perbaikan = null;

    return this.prisma.$transaction(async (tx) => {
      await tx.inovasi.update({
        where: { id },
        data: inovasiData,
      });

      if (assessment_answers && assessment_answers.length > 0) {
        await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1 } });
        await tx.assessmentAnswer.createMany({
          data: assessment_answers.map((a: any) => ({
            inovasi_id: id,
            question_id: a.question_id,
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

    if (existing.status !== 'PERBAIKAN') {
      throw new ForbiddenException(
        'Inovasi hanya dapat dihapus jika statusnya PERBAIKAN',
      );
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
    for (const answer of dto.answers) {
      if (headerIds.has(answer.question_id)) continue;
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
        where: { inovasi_id: inovasiId, tahap },
      });

      if (dto.answers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: dto.answers.map((a) => ({
            inovasi_id: inovasiId,
            tahap,
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
      await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id, tahap: 1 } });

      if (dto.assessment_answers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: dto.assessment_answers.map((a) => ({
            inovasi_id: id,
            question_id: a.question_id,
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
    const { columns, questionTitle } = await loadTemplateConfig(this.prisma, tahap);
    const buffer = await this.buildPdfBuffer({ ...inovasi, ba_columns: columns, ba_question_title: questionTitle, tahap, usulan_signatures: inovasi.usulan_signatures.filter((s) => s.tahap === tahap) });
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

      const satker = inovasi.satker?.nama_satker || '-';
      const judul = inovasi.judul || '-';
      const answers = inovasi.assessment_answers || [];

      // === 1. Judul dokumen (center + bold) ===
      doc.font('Times-Bold').fontSize(14);
      doc.text(inovasi.tahap === 2 ? 'Berita Acara Penilaian Inovasi Tahap 2' : 'Form Seleksi Awal Penilaian Inovasi', 40, 50, {
        width: doc.page.width - 80,
        align: 'center',
      });

      // === 2. Informasi Satker & Inovasi (rata kiri) ===
      doc.font('Times-Roman').fontSize(11);
      doc.text(`Satker: ${satker}`, 40, 74);
      doc.text(`Inovasi: ${judul}`, 40, 88);

      // === 3. Tabel Evaluasi ===
      const tableBottom = this.drawEvaluationTable(doc, answers, 104, inovasi.ba_columns, inovasi.ba_question_title);

      // === 4. Tanda Tangan (tanpa border) ===
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
    answers.filter((a) => !a.question?.parent_id).forEach((parent, i) => {
      row(parent, String(i + 1), false);
      if (parent.question?.is_header) sectionHeader(parent.question);
      answers.filter((a) => a.question?.parent_id === parent.question_id).forEach((child, j) => row(child, parent.question?.is_header ? String(j + 1) : `${i + 1}.${String.fromCharCode(97 + j)}`, !parent.question?.is_header));
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

    const ttdGap = 4 * 13.2; // ruang kosong untuk coretan (setara 4 baris)

    let y = tableBottom + 45;
    if (y + 60 > pageBottom) {
      doc.addPage();
      y = 60;
    }

    // Ambil semua tanda tangan dari usulan_signatures
    const signatures = inovasi.usulan_signatures || [];

    const width = tableWidth / 2;
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
  }

  async sign(id: number, dto: SignInovasiDto, user: { sub: number }, tahap = 1) {
    this.validateTahap(tahap);
    if (!['LOLOS', 'TIDAK_LOLOS'].includes(dto.keputusan ?? '')) throw new BadRequestException('Pilih Lolos atau Tidak Lolos');
    if (!dto.nip.trim() || !dto.jabatan.trim()) throw new BadRequestException('Isi NIP dan peran penanda tangan');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Inovasi" WHERE id = ${id} FOR UPDATE`;
      const inovasi = await tx.inovasi.findUnique({
        where: { id },
        include: { penilai: { select: { id: true } }, penilai_tahap2: { select: { id: true } }, usulan_signatures: { where: { tahap }, select: { id: true } } },
      });

      if (!inovasi) {
        throw new NotFoundException('Inovasi tidak ditemukan');
      }

      if (tahap === 2 && inovasi.status !== StatusInovasi.SELESAI_EVALUASI) throw new BadRequestException('Tahap 1 belum selesai');
      if (tahap === 2 && !inovasi.usulan_signatures.length) {
        const expected = await this.getStage2QuestionIds(id, tx);
        const saved = await tx.assessmentAnswer.findMany({ where: { inovasi_id: id, tahap: 2 }, select: { question_id: true } });
        const savedIds = new Set(saved.map((answer) => answer.question_id));
        if (!expected.length || expected.some((questionId) => !savedIds.has(questionId))) throw new BadRequestException('Simpan seluruh jawaban Tahap 2 sebelum menandatangani');
      }
      // Cek apakah user ini adalah penilai yang ter-assign pada usulan ini
      const isAssignedPenilai = (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).some((p) => p.id === user.sub);
      if (!isAssignedPenilai) {
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

      const signer = await tx.user.findUniqueOrThrow({ where: { id: user.sub }, select: { nama_lengkap: true } });

      // Buat entri tanda tangan baru di usulan_signatures
      await tx.usulinSignature.create({
        data: {
          usulan_id: id,
          user_id: user.sub,
          tahap,
          role: dto.jabatan, // menggunakan jabatan sebagai role
          nama: signer.nama_lengkap,
          nip: dto.nip,
          jabatan: dto.jabatan,
          ttd_image: dto.signature_data,
          keputusan: dto.keputusan,
        },
      });

      // Hitung total tanda tangan dan total penilai yang ter-assign
      const totalSignatures = await tx.usulinSignature.count({
        where: { usulan_id: id, tahap },
      });
      const totalAssigned = (tahap === 2 ? inovasi.penilai_tahap2 : inovasi.penilai).length;

      // Jika total tanda tangan sama dengan total penilai yang ter-assign,ubah status menjadi SELESAI_EVALUASI
      if (totalSignatures >= totalAssigned) {
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
  }) {
    const shouldFilterBySatker = user.role === 'UNIT' && !!user.satker_id;
    const where: Prisma.InovasiWhereInput = shouldFilterBySatker
      ? { satker_id: user.satker_id! }
      : {};

    const [
      total_usulan,
      total_pending,
      total_approved,
      total_rejected,
      total_perbaikan,
      total_selesai_evaluasi,
      chartStatus,
      chartKriteria,
      chartTimeline,
      chartTahapRows,
    ] = await Promise.all([
      this.prisma.inovasi.count({ where }),
      this.prisma.inovasi.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.inovasi.count({ where: { ...where, status: 'APPROVED' } }),
      this.prisma.inovasi.count({ where: { ...where, status: 'REJECTED' } }),
      this.prisma.inovasi.count({ where: { ...where, status: 'PERBAIKAN' } }),
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
      this.prisma.$queryRawUnsafe<Array<{ bulan: string; total: bigint }>>(
        `SELECT TO_CHAR(created_at, 'YYYY-MM') AS bulan, COUNT(*)::int8 AS total
         FROM "Inovasi"
         ${shouldFilterBySatker ? `WHERE satker_id = ${user.satker_id}` : ''}
         GROUP BY bulan
         ORDER BY bulan ASC`,
      ),
      this.prisma.inovasi.findMany({
        where,
        select: {
          status: true,
          status_tahap2: true,
          penilai: { select: { id: true } },
          penilai_tahap2: { select: { id: true } },
          usulan_signatures: { select: { user_id: true, tahap: true, keputusan: true } },
        },
      }),
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
    for (const item of chartTahapRows) {
      const stageInputs = [
        { tahap: 1, status: item.status, penilai: item.penilai, active: true },
        {
          tahap: 2,
          status: item.status_tahap2,
          penilai: item.penilai_tahap2,
          active: item.status === StatusInovasi.SELESAI_EVALUASI && (item.penilai_tahap2.length > 0 || item.usulan_signatures.some((signature) => signature.tahap === 2)),
        },
      ];
      for (const stage of stageInputs) {
        if (!stage.active) continue;
        const summary = chartTahap[stage.tahap - 1];
        const status = statusPenilaian(stage.status, stage.penilai, item.usulan_signatures, stage.tahap);
        if (status === 'LOLOS') summary.lolos++;
        else if (status === 'TIDAK_LOLOS') summary.tidak_lolos++;
        else if (status === 'PERBAIKAN') summary.perbaikan++;
        else if (status === 'SEDANG_DIREVIEW') summary.sedang_direview++;
        else if (status === 'MENUNGGU_TTD') summary.menunggu_ttd++;
        else summary.sedang_direview++;
      }
    }

    return {
      summary_cards: {
        total_usulan,
        total_pending,
        total_approved,
        total_rejected,
        total_perbaikan,
        total_selesai_evaluasi,
      },
      chart_status: Array.from(jenisCounts, ([jenis_inovasi, total]) => ({ jenis_inovasi, total }))
        .sort((a, b) => a.jenis_inovasi.localeCompare(b.jenis_inovasi)),
      chart_kriteria: chartKriteria.map((item) => ({
        kriteria_inovasi: item.kriteria_inovasi,
        total: item._count.id,
      })),
      chart_timeline: chartTimeline.map((item) => ({
        bulan: item.bulan,
        total: Number(item.total),
      })),
      chart_tahap: chartTahap,
    };
  }
}
