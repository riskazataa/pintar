import { InovasiService } from './inovasi.service';

describe('Kesimpulan Penilaian Akhir', () => {
  let db: any;
  let service: InovasiService;
  beforeEach(() => {
    db = {
      inovasi: { findUnique: jest.fn().mockResolvedValue({ status: 'SELESAI_EVALUASI', penilai: [], penilai_tahap2: [{ id: 10 }] }) },
      usulinSignature: { count: jest.fn().mockResolvedValue(0) },
      assessmentTemplatePackage: { findFirst: jest.fn().mockResolvedValue({ config: { columns: [] } }) },
      assessmentQuestion: { findMany: jest.fn(async ({ where }) => where.is_header ? [] : [{ id: 20 }]) },
      assessmentAnswer: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(async (callback) => callback(db)),
    };
    service = new InovasiService(db);
  });
  const submit = (values: Record<string, string>) => ({ answers: [{ question_id: 20, jawaban_boolean: false, custom_values: values }] });
  it('menolak opsi tidak valid dan Lainnya tanpa catatan', async () => {
    await expect(service.updateAssessmentByPenilai(1, submit({ __kesimpulan: 'Bebas' }), { sub: 10, role: 'REVIEWER' }, 2)).rejects.toThrow('Pilih kesimpulan');
    await expect(service.updateAssessmentByPenilai(1, submit({ __kesimpulan: 'Lainnya', __kesimpulan_catatan: ' ' }), { sub: 10, role: 'REVIEWER' }, 2)).rejects.toThrow('Catatan');
    expect(db.assessmentAnswer.createMany).not.toHaveBeenCalled();
  });
  it('menyimpan pilihan Lainnya beserta catatan reviewer', async () => {
    const values = { __kesimpulan: 'Lainnya', __kesimpulan_catatan: 'Perlu pembahasan lanjutan.' };
    await service.updateAssessmentByPenilai(1, submit(values), { sub: 10, role: 'REVIEWER' }, 2);
    expect(db.assessmentAnswer.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ custom_values: values, tahap: 2, source: 'PENILAI' })] });
  });
});
