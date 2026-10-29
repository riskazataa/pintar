import {
  Injectable,
  NotFoundException,
  ForbiddenException,
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
      nama: sig.nama || sig.user.nama_lengkap,
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

  async generatePdf(id: number): Promise<{ buffer: Buffer; filename: string }> {
    const inovasi = await this.prisma.inovasi.findUnique({
      where: { id },
      include: this.includeConfig,
    });

    if (!inovasi) {
      throw new NotFoundException('Inovasi tidak ditemukan');
    }

    const buffer = await this.buildPdfBuffer(inovasi);
    const filename = `BA_Inovasi_${this.sanitizeFilename(inovasi.judul)}.pdf`;

    return { buffer, filename };
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
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      const satker = inovasi.satker?.nama_satker || '-';
      const judul = inovasi.judul || '-';
      const answers = inovasi.assessment_answers || [];

      // === 1. Judul dokumen (center + bold) ===
      doc.font('Times-Bold').fontSize(14);
      doc.text('Form Seleksi Awal Penilaian Inovasi', 40, 50, {
        width: 515.28,
        align: 'center',
      });

      // === 2. Informasi Satker & Inovasi (rata kiri) ===
      doc.font('Times-Roman').fontSize(11);
      doc.text(`Satker: ${satker}`, 40, 74);
      doc.text(`Inovasi: ${judul}`, 40, 88);

      // === 3. Tabel Evaluasi ===
      const tableBottom = this.drawEvaluationTable(doc, answers, 104);

      // === 4. Tanda Tangan (tanpa border) ===
      this.drawSignatureBlocks(doc, inovasi, tableBottom);

      doc.end();
    });
  }

  private drawEvaluationTable(
    doc: PDFKit.PDFDocument,
    answers: any[],
    startY: number,
  ): number {
    const pageBottom = 800;
    const paddingX = 4;
    const paddingY = 4;
    const fontSize = 10;
    const minRowHeight = 18;

    // Area lebar yang aman tersedia untuk tabel (dihitung dari margin dokumen)
    const usableWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;

    // Lebar tiap kolom dalam persentase agar total pas 100% dari usableWidth
    const colNoWidth = usableWidth * 0.05;
    const colKriteriaWidth = usableWidth * 0.5;
    const colYaTidakWidth = usableWidth * 0.15;
    const colCatatanWidth =
      usableWidth - (colNoWidth + colKriteriaWidth + colYaTidakWidth);

    // Total lebar tabel keseluruhan (dipakai untuk menutup kotak di ujung kanan)
    const totalWidth =
      colNoWidth + colKriteriaWidth + colYaTidakWidth + colCatatanWidth;

    const colWidths = [
      colNoWidth,
      colKriteriaWidth,
      colYaTidakWidth,
      colCatatanWidth,
    ];
    const colXs: number[] = [];
    let acc = startX;
    colWidths.forEach((w) => {
      colXs.push(acc);
      acc += w;
    });

    let y = startY;

    const measure = (text: string, width: number, bold: boolean): number => {
      doc.font(bold ? 'Times-Bold' : 'Times-Roman').fontSize(fontSize);
      return doc.heightOfString(text || ' ', { width });
    };

    const drawCells = (
      cells: { text: string; bold: boolean; halign: 'left' | 'center' }[],
      cellHeights: number[],
      rowHeight: number,
    ) => {
      const startYVal = y || 0;
      const rowHeightVal = rowHeight || minRowHeight;
      const startXVal = startX || 0;
      const totalWidthVal = totalWidth || 0;

      doc.lineWidth(1);
      doc.moveTo(startXVal, startYVal).lineTo(startXVal + totalWidthVal, startYVal).stroke();

      // Garis vertikal pembatas antar kolom (semua kolom termasuk batas kiri kanan)
      // colXs memiliki 4 elemen: [kiri_kol1, kiri_kol2, kiri_kol3, kiri_kol4]
      // Loop ini menggambar garis di colXs[0], colXs[1], colXs[2], colXs[3]
      // - colXs[3] adalah garis pembatas antara kolom Ya/Tidak dan Catatan
      // lalu right border di luar loop: startX + totalWidth
      for (let i = 0; i < colXs.length; i++) {
        const xVal = colXs[i] || startXVal;
        doc.moveTo(xVal, startYVal).lineTo(xVal, startYVal + rowHeightVal).stroke();
      }

      // Garis vertikal penutup sisi kanan paling luar (right border)
      const rightBorderX = startXVal + totalWidthVal;
      doc.moveTo(rightBorderX, startYVal)
        .lineTo(rightBorderX, startYVal + rowHeightVal)
        .stroke();

      // Gambar border bawah untuk setiap cell
      cells.forEach((cell, i) => {
        const textY =
          startYVal + Math.max(paddingY, (rowHeightVal - (cellHeights[i] || 0)) / 2);
        doc.font(cell.bold ? 'Times-Bold' : 'Times-Roman').fontSize(fontSize);
        doc.text(cell.text || '', (colXs[i] || startXVal) + paddingX, textY, {
          width: (colWidths[i] || 0) - paddingX * 2,
          align: cell.halign,
          lineBreak: true,
        });
        // Gambar border bawah cell menggunakan colXs[i+1] atau right border sebagai fallback
        const nextX = colXs[i + 1] || rightBorderX;
        doc.moveTo(colXs[i] || startXVal, startYVal + rowHeightVal).lineTo(nextX, startYVal + rowHeightVal).stroke();
      });

      // Gambar border bawah terakhir yang mencakup sel terakhir
      doc.moveTo(startXVal, startYVal + rowHeightVal).lineTo(startXVal + totalWidthVal, startYVal + rowHeightVal).stroke();

      y += rowHeightVal;
    };

    const headerCells = [
      { text: 'No', bold: true, halign: 'center' as const },
      {
        text: 'Kriteria Penilaian Seleksi Awal',
        bold: true,
        halign: 'center' as const,
      },
      { text: 'Ya/Tidak (V)', bold: true, halign: 'center' as const },
      { text: 'Catatan', bold: true, halign: 'center' as const },
    ];

    const renderHeader = () => {
      const cellHeights = headerCells.map((c, i) =>
        measure(c.text, colWidths[i] - paddingX * 2, c.bold),
      );
      const rowHeight = Math.max(
        minRowHeight,
        ...cellHeights.map((h) => h + paddingY * 2),
      );
      drawCells(headerCells, cellHeights, rowHeight);
    };

    const renderRow = (
      cells: { text: string; bold: boolean; halign: 'left' | 'center' }[],
    ) => {
      const cellHeights = cells.map((c, i) =>
        measure(c.text, colWidths[i] - paddingX * 2, c.bold),
      );
      const rowHeight = Math.max(
        minRowHeight,
        ...cellHeights.map((h) => h + paddingY * 2),
      );

      if (y + rowHeight > pageBottom) {
        doc.addPage();
        y = 50;
        renderHeader();
      }

      drawCells(cells, cellHeights, rowHeight);
    };

    renderHeader();

    const parents = answers.filter((a: any) => !a.question?.parent_id);

    if (parents.length === 0) {
      renderRow([
        { text: '', bold: false, halign: 'center' },
        { text: 'Belum ada data penilaian.', bold: false, halign: 'left' },
        { text: '', bold: false, halign: 'center' },
        { text: '', bold: false, halign: 'left' },
      ]);
    } else {
      parents.forEach((parent: any, pIdx: number) => {
        const children = answers.filter(
          (a: any) => a.question?.parent_id === parent.question?.id,
        );

        renderRow([
          { text: String(pIdx + 1), bold: true, halign: 'center' },
          {
            text: parent.question?.pertanyaan || '-',
            bold: true,
            halign: 'left',
          },
          {
            text: parent.jawaban_boolean ? 'V' : '',
            bold: true,
            halign: 'center',
          },
          {
            text: parent.catatan_string || '',
            bold: false,
            halign: 'left',
          },
        ]);

        children.forEach((child: any, cIdx: number) => {
          const letter = String.fromCharCode(97 + cIdx);
          renderRow([
            { text: `${pIdx + 1}.${letter}`, bold: false, halign: 'center' },
            {
              text: `    ${letter}. ${child.question?.pertanyaan || '-'}`,
              bold: false,
              halign: 'left',
            },
            {
              text: child.jawaban_boolean ? 'V' : '',
              bold: false,
              halign: 'center',
            },
            {
              text: child.catatan_string || '',
              bold: false,
              halign: 'left',
            },
          ]);
        });
      });
    }

    // Garis bawah penutup tabel
    doc.lineWidth(1);
    doc.moveTo(startX, y).lineTo(startX + totalWidth, y).stroke();

    return y;
  }

  private drawSignatureBlocks(
    doc: PDFKit.PDFDocument,
    inovasi: any,
    tableBottom: number,
  ) {
    const pageWidth = 595.28;
    const marginX = 40;
    const tableWidth = pageWidth - marginX * 2;
    const pageBottom = 800;

    const ttdGap = 4 * 13.2; // ruang kosong untuk coretan (setara 4 baris)

    let y = tableBottom + 45;
    if (y + 60 > pageBottom) {
      doc.addPage();
      y = 60;
    }

    // Ambil semua tanda tangan dari usulan_signatures
    const signatures = inovasi.usulan_signatures || [];

    const centerXPositions = [
      marginX + tableWidth * 0.25,
      marginX + tableWidth * 0.5,
      marginX + tableWidth * 0.75,
    ];

    const startX = marginX;
    const usableWidth = tableWidth;

    signatures.forEach((sig, idx) => {
      const centerX = centerXPositions[idx] || marginX + tableWidth / 2;
      const blockHeight = 18 + ttdGap + 14 + 16;

      if (y + blockHeight > pageBottom) {
        doc.addPage();
        y = 60;
      }

      const ttdTop = y + 18;
      const nameY = ttdTop + ttdGap + 8;
      const nipY = nameY + 14;

      // Nama Jabatan
      doc.font('Times-Bold').fontSize(11);
      const jabatanText = sig.role === 'SKI' ? 'SKI' : sig.role === 'Timker Manajemen Risiko' ? 'Timker Manajemen Risiko' : sig.role === 'Reformasi Birokrasi' ? 'Reformasi Birokrasi' : 'Monev';
      doc.text(jabatanText, centerX, y);

      // Ruang kosong / gambar tanda tangan
      if (sig.ttd_image) {
        try {
          const base64 = sig.ttd_image.replace(/^data:image\/\w+;base64,/, '');
          doc.image(Buffer.from(base64, 'base64'), centerX - 70, ttdTop, {
            fit: [140, ttdGap],
            align: 'center',
            valign: 'center',
          });
        } catch {
          // biarkan ruang tanda tangan kosong bila gambar gagal dimuat
        }
      }

      // Nama Lengkap
      doc.font('Times-Roman').fontSize(11);
      if (sig.nama) {
        doc.text(sig.nama, centerX, nameY);
      }

      // NIP
      doc.font('Times-Roman').fontSize(10);
      doc.text(`NIP. ${sig.nip || ''}`, centerX, nipY);

      y += blockHeight + 20;
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

    const signer = await this.prisma.user.findUniqueOrThrow({ where: { id: user.sub }, select: { nama_lengkap: true } });

    // Buat entri tanda tangan baru di usulan_signatures
    await this.prisma.usulinSignature.create({
      data: {
        usulan_id: id,
        user_id: user.sub,
        role: dto.jabatan, // menggunakan jabatan sebagai role
        nama: signer.nama_lengkap,
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
