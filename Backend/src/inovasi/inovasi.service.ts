import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, StatusInovasi } from '@prisma/client';
import { CreateInovasiDto } from './dto/create-inovasi.dto';
import { UpdateInovasiDto } from './dto/update-inovasi.dto';
import { QueryInovasiDto } from './dto/query-inovasi.dto';
import { UpdateAssessmentPenilaiDto } from './dto/update-assessment-penilai.dto';
import { UpdateAssessmentAnswersDto } from './dto/update-assessment-answers.dto';
import { SignInovasiDto } from './dto/sign-inovasi.dto';

@Injectable()
export class InovasiService {
  constructor(private readonly prisma: PrismaService) {}

  private get includeConfig() {
    return {
      satker: { select: { id: true, nama_satker: true } },
      user: { select: { id: true, nama_lengkap: true } },
      penilai: { select: { id: true, nama_lengkap: true } },
      usulan_signatures: {
        include: {
          user: { select: { id: true, nama_lengkap: true } },
        },
      },
      assessment_answers: {
        include: {
          question: { select: { id: true, pertanyaan: true, parent_id: true } },
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
    const { search, satker_id, status, start_date, end_date, assignedToMe } =
      query;

    const where: Prisma.InovasiWhereInput = {};

    if (user.role === 'SATKER' && user.satker_id) {
      where.satker_id = user.satker_id;
    } else if (
      ['SUPER_ADMIN', 'TIM_PENILAI_MARVEL', 'TIM_PENILAI_ITJEN'].includes(
        user.role,
      ) &&
      satker_id
    ) {
      where.satker_id = satker_id;
    }

    if (assignedToMe && user.sub) {
      where.penilai = { some: { id: user.sub } };
    }

    if (status) {
      where.status = status;
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
        where.created_at.lte = new Date(end_date);
      }
    }

    const total = await this.prisma.inovasi.count({ where });

    const data = await this.prisma.inovasi.findMany({
      where,
      include: this.includeConfig,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id },
      include: this.includeConfig,
    });

    if (!inovasi) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

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
      nama: sig.nama,
      nip: sig.nip,
      ttd_image: sig.ttd_image,
      created_at: sig.created_at,
    }));

    return {
      ...inovasi,
      assigned_users: assignedUsers,
      signatures: signatures,
    };
  }

  async assignPenilai(inovasiId: number, penilaiIds: number[]) {
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id: inovasiId },
    });
    if (!inovasi) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: penilaiIds } },
      select: { id: true },
    });

    if (users.length !== penilaiIds.length) {
      throw new NotFoundException('Beberapa user penilai tidak ditemukan');
    }

    return this.prisma.inovasi.update({
      where: { id: inovasiId },
      data: {
        penilai: {
          set: penilaiIds.map((id) => ({ id })),
        },
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

  async create(
    dto: CreateInovasiDto,
    user: { sub: number; role: string; satker_id?: number | null },
  ) {
    const assessment_answers = dto.assessment_answers;
    const inovasiData = {
      judul: dto.judul,
      tahun: dto.tahun,
      jenis_inovasi: dto.jenis_inovasi,
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

    if (user.role === 'SATKER' && existing.satker_id !== user.satker_id) {
      throw new ForbiddenException('Anda tidak memiliki akses ke inovasi ini');
    }

    const assessment_answers = (dto as any).assessment_answers;
    const inovasiData: Record<string, any> = {};
    if (dto.judul !== undefined) inovasiData.judul = dto.judul;
    if (dto.tahun !== undefined) inovasiData.tahun = dto.tahun;
    if (dto.jenis_inovasi !== undefined)
      inovasiData.jenis_inovasi = dto.jenis_inovasi;
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
        await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id } });
        await tx.assessmentAnswer.createMany({
          data: assessment_answers.map((a: any) => ({
            inovasi_id: id,
            question_id: a.question_id,
            jawaban_boolean: a.jawaban_boolean,
            catatan_string: a.catatan_string,
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

    if (user.role === 'SATKER' && existing.satker_id !== user.satker_id) {
      throw new ForbiddenException('Anda tidak memiliki akses ke inovasi ini');
    }

    await this.prisma.inovasi.delete({ where: { id } });

    return { message: 'Inovasi berhasil dihapus' };
  }

  async updateAssessmentByPenilai(
    inovasiId: number,
    dto: UpdateAssessmentPenilaiDto,
    user: { sub: number; role: string },
  ) {
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id: inovasiId },
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

    return this.prisma.$transaction(async (tx) => {
      await tx.assessmentAnswer.deleteMany({
        where: { inovasi_id: inovasiId },
      });

      if (dto.answers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: dto.answers.map((a) => ({
            inovasi_id: inovasiId,
            question_id: a.question_id,
            jawaban_boolean: a.jawaban_boolean,
            catatan_string: a.catatan_string,
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
    const existing = await this.prisma.inovasi.findUnique({
      where: { id },
      select: { id: true, user_id: true, satker_id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    if (user.role === 'SATKER' && existing.user_id !== user.sub) {
      throw new ForbiddenException('Anda tidak memiliki akses ke inovasi ini');
    }

    if (!['PENDING', 'PERBAIKAN'].includes(existing.status)) {
      throw new ForbiddenException(
        'Jawaban assessment hanya dapat diubah jika status PENDING atau PERBAIKAN',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.assessmentAnswer.deleteMany({ where: { inovasi_id: id } });

      if (dto.assessment_answers.length > 0) {
        await tx.assessmentAnswer.createMany({
          data: dto.assessment_answers.map((a) => ({
            inovasi_id: id,
            question_id: a.question_id,
            jawaban_boolean: a.jawaban_boolean,
            catatan_string: a.catatan_string,
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

  async sign(id: number, dto: SignInovasiDto, user: { sub: number }) {
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id },
      include: { penilai: { select: { id: true } } },
    });

    if (!inovasi) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    // Cek apakah user ini adalah penilai yang ter-assign pada usulan ini
    const isAssignedPenilai = inovasi.penilai.some((p) => p.id === user.sub);
    if (!isAssignedPenilai) {
      throw new ForbiddenException(
        'Anda tidak ditugaskan sebagai penilai inovasi ini',
      );
    }

    // Cek apakah user sudah pernah menandatangani usulan ini
    const existingSignature = await this.prisma.usulinSignature.findFirst({
      where: {
        usulan_id: id,
        user_id: user.sub,
      },
    });

    if (existingSignature) {
      throw new ForbiddenException('Anda sudah menandatangani usulan ini');
    }

    // Buat entri tanda tangan baru di usulan_signatures
    await this.prisma.usulinSignature.create({
      data: {
        usulan_id: id,
        user_id: user.sub,
        role: dto.jabatan, // menggunakan jabatan sebagai role
        nama: '', // nama tidak diterima dari payload baru, bisa dikosongkan atau diisi sesuai kebutuhan
        nip: dto.nip,
        jabatan: dto.jabatan,
        ttd_image: dto.signature_data,
      },
    });

    // Hitung total tanda tangan dan total penilai yang ter-assign
    const totalSignatures = await this.prisma.usulinSignature.count({
      where: { usulan_id: id },
    });
    const totalAssigned = inovasi.penilai.length;

    // Jika total tanda tangan sama dengan total penilai yang ter-assign,ubah status menjadi SELESAI_EVALUASI
    if (totalSignatures >= totalAssigned) {
      await this.prisma.inovasi.update({
        where: { id },
        data: { status: StatusInovasi.SELESAI_EVALUASI },
      });
    }

    return this.prisma.inovasi.findUnique({
      where: { id },
      include: this.includeConfig,
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
    const shouldFilterBySatker = user.role === 'SATKER' && !!user.satker_id;
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
    ] = await Promise.all([
      this.prisma.inovasi.count({ where }),
      this.prisma.inovasi.count({ where: { ...where, status: 'PENDING' } }),
      this.prisma.inovasi.count({ where: { ...where, status: 'APPROVED' } }),
      this.prisma.inovasi.count({ where: { ...where, status: 'REJECTED' } }),
      this.prisma.inovasi.count({ where: { ...where, status: 'PERBAIKAN' } }),
      this.prisma.inovasi.count({
        where: { ...where, status: 'SELESAI_EVALUASI' },
      }),
      this.prisma.inovasi.groupBy({
        by: ['jenis_inovasi'],
        where,
        _count: { id: true },
        orderBy: { jenis_inovasi: 'asc' },
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
    ]);

    return {
      summary_cards: {
        total_usulan,
        total_pending,
        total_approved,
        total_rejected,
        total_perbaikan,
        total_selesai_evaluasi,
      },
      chart_status: chartStatus.map((item) => ({
        jenis_inovasi: item.jenis_inovasi,
        total: item._count.id,
      })),
      chart_kriteria: chartKriteria.map((item) => ({
        kriteria_inovasi: item.kriteria_inovasi,
        total: item._count.id,
      })),
      chart_timeline: chartTimeline.map((item) => ({
        bulan: item.bulan,
        total: Number(item.total),
      })),
    };
  }
}
