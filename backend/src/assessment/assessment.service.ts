import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { TemplateColumnsDto } from './dto/template-columns.dto';
import { loadTemplateConfig } from './template-config';

@Injectable()
export class AssessmentService {
  constructor(private readonly prisma: PrismaService) {}

  async getColumns(tahap: number) {
    if (![1, 2].includes(tahap)) throw new BadRequestException('Tahap harus 1 atau 2');
    return loadTemplateConfig(this.prisma, tahap);
  }

  async saveColumns(tahap: number, dto: TemplateColumnsDto) {
    if (![1, 2].includes(tahap)) throw new BadRequestException('Tahap harus 1 atau 2');
    const keys = dto.columns.map((c) => c.key);
    if (new Set(keys).size !== keys.length || dto.columns.some((c) => !c.title.trim())) throw new BadRequestException('Nama kolom wajib diisi dan kunci harus unik');
    for (const column of dto.columns) {
      if (['select', 'radio'].includes(column.type) && (!column.options?.length || new Set(column.options).size !== column.options.length)) throw new BadRequestException(`Kolom ${column.title} memerlukan opsi yang unik`);
      if (column.type === 'readonly' && column.required && !column.defaultValue?.trim()) throw new BadRequestException(`Isi nilai tetap untuk kolom ${column.title}`);
    }
    const source = tahap === 2 ? await this.getColumns(1) : null;
    const config = source ? { ...dto, columns: dto.columns.filter((column) => !source.columns.some((inherited) => inherited.key === column.key)) } : dto;
    await this.prisma.assessmentTemplatePackage.create({ data: { nama: `BA_COLUMNS_STAGE_${tahap}`, config: JSON.parse(JSON.stringify(config)) } });
    return dto;
  }

  async findActiveQuestions(tahap = 1) {
    if (![1, 2].includes(tahap)) throw new BadRequestException("Tahap harus 1 atau 2");
    return this.prisma.assessmentQuestion.findMany({
      where: { parent_id: null, is_active: true, tahap: tahap === 2 ? { in: [1, 2] } : 1, ...(tahap === 2 ? { OR: [{ tahap: 2 }, { tahap: 1, tahap2_hidden: false }] } : {}) },
      include: {
        children: {
          where: { is_active: true, ...(tahap === 2 ? { OR: [{ tahap: 2 }, { tahap: 1, tahap2_hidden: false }] } : {}) },
          orderBy: [{ urutan: 'asc' }, { id: 'asc' }],
        },
      },
      orderBy: [{ tahap: 'asc' }, { urutan: 'asc' }, { id: 'asc' }],
    });
  }

  async findAllQuestions() {
    return this.prisma.assessmentQuestion.findMany({
      orderBy: [{ tahap: 'asc' }, { urutan: 'asc' }, { id: 'asc' }],
    });
  }

  async createQuestion(dto: CreateQuestionDto) {
    if (dto.question_title_override === '__FINAL_CONCLUSION__') {
      if (dto.tahap !== 2 || dto.parent_id || dto.is_header) throw new BadRequestException('Kesimpulan hanya tersedia sebagai baris Penilaian Akhir');
      dto.satker_lock_mode = 'ROW';
      const existing = await this.prisma.assessmentQuestion.findFirst({ where: { tahap: 2, is_active: true, question_title_override: '__FINAL_CONCLUSION__' } });
      if (existing) throw new BadRequestException('Bagian kesimpulan sudah tersedia');
    }
    if (dto.is_header && dto.parent_id) throw new BadRequestException("Header bagian harus menjadi baris utama");
    if (dto.parent_id) {
      const parent = await this.prisma.assessmentQuestion.findUnique({ where: { id: dto.parent_id } });
      if (!parent || parent.parent_id || !parent.is_active || parent.tahap !== (dto.tahap ?? 1)) throw new BadRequestException("Induk pertanyaan harus aktif dan berada di tahap yang sama");
    }
    const urutan = await this.nextOrder(dto.tahap ?? 1, dto.parent_id ?? null);
    return this.prisma.assessmentQuestion.create({
      data: {
        pertanyaan: dto.pertanyaan,
        satker_lock_mode: dto.satker_lock_mode ?? 'NONE',
        is_header: dto.is_header ?? false,
        question_title_override: dto.question_title_override ?? null,
        column_titles: dto.column_titles ?? undefined,
        tahap: dto.tahap ?? 1,
        is_active: dto.is_active ?? true,
        parent_id: dto.parent_id ?? null,
        urutan,
      },
    });
  }

  async createQuestions(rows: (CreateQuestionDto & { section_header_id?: number | null })[]) {
    if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) throw new BadRequestException('Masukkan antara 1 sampai 100 baris');
    const stage = rows[0].tahap ?? 1;
    if (![1, 2].includes(stage) || rows.some((row) => (row.tahap ?? 1) !== stage || typeof row.pertanyaan !== 'string' || row.is_header && row.parent_id)) {
      throw new BadRequestException('Data baris tidak valid');
    }
    if (rows.some((row) => row.parent_id)) throw new BadRequestException('Tambah banyak hanya membuat baris utama');
    const sectionHeaderIds = [...new Set(rows.map((row) => row.section_header_id).filter((id): id is number => Boolean(id)))];
    if (sectionHeaderIds.length > 1) throw new BadRequestException('Pilih satu header untuk penyisipan baris');
    let insertAfterOrder: number | null = null;
    if (sectionHeaderIds.length) {
      const header = await this.prisma.assessmentQuestion.findFirst({ where: { id: sectionHeaderIds[0], is_active: true, tahap: stage, parent_id: null, is_header: true } });
      if (!header) throw new BadRequestException('Header tujuan tidak ditemukan');
      insertAfterOrder = header.urutan;
    }
    const startOrder = insertAfterOrder === null ? await this.nextOrder(stage, null) : insertAfterOrder + 1;
    return this.prisma.$transaction(async (tx) => {
      if (insertAfterOrder !== null) await tx.assessmentQuestion.updateMany({ where: { tahap: stage, parent_id: null, is_active: true, urutan: { gt: insertAfterOrder } }, data: { urutan: { increment: rows.length } } });
      return Promise.all(rows.map((row, index) => tx.assessmentQuestion.create({ data: { pertanyaan: row.pertanyaan.trim(), tahap: stage, is_active: true, is_header: false, satker_lock_mode: row.satker_lock_mode ?? 'NONE', parent_id: null, urutan: startOrder + index } })));
    });
  }

  private async nextOrder(tahap: number, parent_id: number | null) {
    const last = await this.prisma.assessmentQuestion.findFirst({ where: { tahap, parent_id, is_active: true }, orderBy: [{ urutan: 'desc' }, { id: 'desc' }], select: { urutan: true } });
    return (last?.urutan ?? -1) + 1;
  }

  async reorderQuestions(tahap: number, parent_id: number | null, ids: number[]) {
    const uniqueIds = [...new Set(ids.map(Number))];
    if (![1, 2].includes(tahap) || !uniqueIds.length || uniqueIds.length !== ids.length) throw new BadRequestException('Urutan baris tidak valid');
    const matches = await this.prisma.assessmentQuestion.findMany({ where: { id: { in: uniqueIds }, tahap, parent_id, is_active: true }, select: { id: true } });
    if (matches.length !== uniqueIds.length) throw new BadRequestException('Baris harus berasal dari tingkat yang sama');
    await this.prisma.$transaction(uniqueIds.map((id, index) => this.prisma.assessmentQuestion.update({ where: { id }, data: { urutan: index } })));
    return { success: true };
  }

  async updateQuestion(id: number, dto: UpdateQuestionDto) {
    const existing = await this.prisma.assessmentQuestion.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Pertanyaan tidak ditemukan');
    }

    if (existing.question_title_override === '__FINAL_CONCLUSION__') {
      dto.question_title_override = '__FINAL_CONCLUSION__';
      dto.satker_lock_mode = 'ROW';
      dto.is_header = false;
    }

    if (dto.is_header && existing.parent_id) throw new BadRequestException("Subbaris tidak dapat menjadi header bagian");
    if (dto.tahap !== undefined && dto.tahap !== existing.tahap) throw new BadRequestException("Tahap pertanyaan tidak dapat diubah");
    if (dto.parent_id !== undefined && dto.parent_id !== existing.parent_id) throw new BadRequestException("Induk pertanyaan tidak dapat diubah");
    return this.prisma.assessmentQuestion.update({
      where: { id },
      data: dto,
    });
  }

  async removeQuestion(id: number, tahap = 1) {
    const existing = await this.prisma.assessmentQuestion.findUnique({
      where: { id },
      include: { children: { select: { id: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Pertanyaan tidak ditemukan');
    }

    if (tahap === 2 && existing.tahap === 1) {
      const ids = [id, ...existing.children.map((child) => child.id)];
      await this.prisma.assessmentQuestion.updateMany({ where: { id: { in: ids } }, data: { tahap2_hidden: true } });
      return { ...existing, tahap2_hidden: true };
    }

    const childIds = existing.children.map((c) => c.id);

    return this.prisma.$transaction(async (tx) => {
      if (childIds.length > 0) {
        await tx.assessmentQuestion.updateMany({
          where: { id: { in: childIds } },
          data: { is_active: false },
        });
      }

      return tx.assessmentQuestion.update({
        where: { id },
        data: { is_active: false },
      });
    });
  }

  async removeQuestions(ids: number[]) {
    const uniqueIds = [...new Set(ids)];
    if (!uniqueIds.length) throw new BadRequestException('Pilih minimal satu baris');
    const rows = await this.prisma.assessmentQuestion.findMany({
      where: { id: { in: uniqueIds }, is_active: true },
      include: { children: { where: { is_active: true }, select: { id: true } } },
    });
    if (rows.length !== uniqueIds.length) throw new BadRequestException('Sebagian baris tidak ditemukan atau sudah dihapus');
    const allIds = new Set(rows.flatMap((row) => [row.id, ...row.children.map((child) => child.id)]));
    return this.prisma.assessmentQuestion.updateMany({
      where: { id: { in: [...allIds] } },
      data: { is_active: false },
    });
  }
}
