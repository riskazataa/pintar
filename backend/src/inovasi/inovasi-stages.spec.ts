import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { InovasiService } from './inovasi.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Pemisahan penilaian per tahap', () => {
  const user = { sub: 10, role: 'REVIEWER' };
  let db: any;
  let service: InovasiService;
  beforeEach(() => {
    db = {
      assessmentTemplatePackage: { findFirst: jest.fn().mockResolvedValue(null) },
      inovasi: { findUnique: jest.fn(), update: jest.fn() },
      assessmentQuestion: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([{ id: 20 }]) },
      assessmentAnswer: { deleteMany: jest.fn(), createMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      usulinSignature: { count: jest.fn().mockResolvedValue(0), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ nama_lengkap: 'Penilai' }) },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(async (callback) => callback(db)),
    };
    service = new InovasiService(db as PrismaService);
  });
  const answers = [{ question_id: 20, jawaban_boolean: true }];

  it('menolak penilai tahap 1 yang tidak ditugaskan pada tahap 2', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', penilai: [{ id: 10 }], penilai_tahap2: [{ id: 11 }] });
    await expect(service.updateAssessmentByPenilai(1, { answers }, user, 2)).rejects.toThrow(ForbiddenException);
    expect(db.assessmentAnswer.deleteMany).not.toHaveBeenCalled();
  });

  it('menyimpan tahap 2 tanpa menghapus jawaban tahap 1', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', penilai: [], penilai_tahap2: [{ id: 10 }] });
    await service.updateAssessmentByPenilai(1, { answers }, user, 2);
    expect(db.assessmentAnswer.deleteMany).toHaveBeenCalledWith({ where: { inovasi_id: 1, tahap: 2 } });
    expect(db.assessmentAnswer.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ inovasi_id: 1, question_id: 20, tahap: 2 })] });
  });

  it('menolak pertanyaan dari template tahap lain', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', penilai: [], penilai_tahap2: [{ id: 10 }] });
    db.assessmentQuestion.findMany.mockResolvedValue([{ id: 99 }]);
    await expect(service.updateAssessmentByPenilai(1, { answers }, user, 2)).rejects.toThrow(BadRequestException);
    expect(db.assessmentAnswer.deleteMany).not.toHaveBeenCalled();
  });

  it('menolak tahap 2 sebelum tahap 1 selesai', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'PENDING', penilai: [], penilai_tahap2: [{ id: 10 }] });
    await expect(service.updateAssessmentByPenilai(1, { answers }, user, 2)).rejects.toThrow(BadRequestException);
  });

  it('mengunci perubahan jawaban setelah tanda tangan pada tahap yang sama', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', penilai: [], penilai_tahap2: [{ id: 10 }] });
    db.usulinSignature.count.mockResolvedValue(1);
    await expect(service.updateAssessmentByPenilai(1, { answers }, user, 2)).rejects.toThrow(ForbiddenException);
    expect(db.usulinSignature.count).toHaveBeenCalledWith({ where: { usulan_id: 1, tahap: 2 } });
  });
  it('menyimpan nilai kolom dinamis dan menolak isian wajib kosong', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', penilai: [], penilai_tahap2: [{ id: 10 }] });
    db.assessmentTemplatePackage.findFirst.mockResolvedValue({ config: { columns: [{ key: 'nilai', title: 'Nilai', type: 'number', required: true }] } });
    await expect(service.updateAssessmentByPenilai(1, { answers }, user, 2)).rejects.toThrow('wajib');
    expect(db.assessmentAnswer.deleteMany).not.toHaveBeenCalled();
    await service.updateAssessmentByPenilai(1, { answers: [{ ...answers[0], custom_values: { nilai: 85 }, link: 'https://example.org' }] }, user, 2);
    expect(db.assessmentAnswer.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ custom_values: { nilai: 85 }, link: 'https://example.org', tahap: 2 })] });
  });

  it('menyimpan pertanyaan warisan bersama tambahan dan menolak menghilangkan hasil Tahap 1', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', penilai: [], penilai_tahap2: [{ id: 10 }] });
    db.assessmentAnswer.findMany.mockResolvedValue([{ question_id: 1 }, { question_id: 2 }]);
    await expect(service.updateAssessmentByPenilai(1, { answers }, user, 2)).rejects.toThrow('seluruh pertanyaan');
    expect(db.assessmentAnswer.deleteMany).not.toHaveBeenCalled();
    const inherited = [{ question_id: 1, jawaban_boolean: true, custom_values: { skor: 0 } }, { question_id: 2, jawaban_boolean: false }];
    await service.updateAssessmentByPenilai(1, { answers: [...inherited, ...answers] }, user, 2);
    expect(db.assessmentAnswer.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ question_id: 1, tahap: 2, custom_values: { skor: 0 } }),
      expect.objectContaining({ question_id: 2, tahap: 2 }),
      expect.objectContaining({ question_id: 20, tahap: 2 }),
    ]) });
    expect(db.assessmentAnswer.deleteMany).toHaveBeenCalledWith({ where: { inovasi_id: 1, tahap: 2 } });
  });

  it('menampilkan hasil Tahap 1 dan pertanyaan tambahan yang belum disimpan', async () => {
    const source = { id: 9, tahap: 1, question_id: 1, question: { id: 1, tahap: 1, pertanyaan: 'Kriteria awal', parent_id: null }, jawaban_boolean: true, catatan_string: 'Catatan asli', custom_values: { nilai: 80 } };
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', status_tahap2: 'PENDING', penilai_tahap2: [{ id: 10 }], usulan_signatures: [{ tahap: 1 }], assessment_answers: [source] });
    db.assessmentQuestion.findMany.mockResolvedValue([{ id: 20, tahap: 2, pertanyaan: 'Tambahan', parent_id: null }]);
    const detail = await service.findOne(1, 2);
    expect(detail.assessment_answers).toEqual(expect.arrayContaining([
      expect.objectContaining({ question_id: 1, jawaban_boolean: true, catatan_string: 'Catatan asli', custom_values: { nilai: 80 } }),
      expect.objectContaining({ question_id: 20, jawaban_boolean: false }),
    ]));
    expect(detail).toMatchObject({ requires_assessment_save: true, signatures: [] });
  });

  it('menunggu jawaban warisan dan tambahan tersimpan sebelum tanda tangan pertama', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', penilai: [], penilai_tahap2: [{ id: 10 }], usulan_signatures: [] });
    db.assessmentAnswer.findMany.mockImplementation(async ({ where }) => where.tahap === 1 ? [{ question_id: 1 }] : [{ question_id: 20 }]);
    const dto = { usulan_inovasi_id: 1, user_id: 10, jabatan: 'SKI', nip: '123', signature_data: 'data:image/png;base64,abc', keputusan: 'LOLOS' };
    await expect(service.sign(1, dto, user, 2)).rejects.toThrow('Simpan seluruh jawaban');
    expect(db.usulinSignature.create).not.toHaveBeenCalled();
    db.assessmentAnswer.findMany.mockImplementation(async ({ where }) => where.tahap === 1 ? [{ question_id: 1 }] : [{ question_id: 1 }, { question_id: 20 }]);
    await service.sign(1, dto, user, 2);
    expect(db.usulinSignature.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tahap: 2, user_id: 10 }) });
  });

  it('memakai pertanyaan yang sudah ditandatangani saat template mendapat tambahan baru', async () => {
    db.inovasi.findUnique.mockResolvedValue({ status: 'SELESAI_EVALUASI', status_tahap2: 'PENDING', penilai: [], penilai_tahap2: [{ id: 10 }], usulan_signatures: [{ id: 2, tahap: 2 }], assessment_answers: [
      { id: 31, tahap: 1, question_id: 1, question: { id: 1, tahap: 1, pertanyaan: 'Awal', parent_id: null }, jawaban_boolean: true },
      { id: 32, tahap: 2, question_id: 1, question: { id: 1, tahap: 1, pertanyaan: 'Awal', parent_id: null }, jawaban_boolean: true },
      { id: 33, tahap: 2, question_id: 20, question: { id: 20, tahap: 2, pertanyaan: 'Tambahan yang dinilai', parent_id: null }, jawaban_boolean: true },
    ] });
    db.assessmentQuestion.findMany.mockResolvedValue([{ id: 99, tahap: 2, pertanyaan: 'Tambahan setelah tanda tangan', parent_id: null }]);
    const detail = await service.findOne(1, 2);
    expect(detail.assessment_answers.map((answer) => answer.question_id)).toEqual([1, 20]);
    expect(detail).toMatchObject({ requires_assessment_save: false });
    await service.sign(1, { usulan_inovasi_id: 1, user_id: 10, jabatan: 'SKI', nip: '123', signature_data: 'data:image/png;base64,abc', keputusan: 'TIDAK_LOLOS' }, user, 2);
    expect(db.assessmentQuestion.findMany).not.toHaveBeenCalled();
    expect(db.usulinSignature.create).toHaveBeenCalled();
  });

});
