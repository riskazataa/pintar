import { InovasiService } from './inovasi.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Tanda tangan penilaian akhir', () => {
  let db: any;
  let service: InovasiService;
  const payload = { usulan_inovasi_id: 1, user_id: 10, nama: 'Nama di BA, SKM', nip: '123456', jabatan: 'Petugas BKK (BKK A)', signature_data: 'data:image/png;base64,AAAA' };
  beforeEach(() => {
    db = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn((callback) => callback(db)),
      inovasi: { findUnique: jest.fn().mockResolvedValue({ id: 1, satker_id: 7, status: 'SELESAI_EVALUASI', penilai: [], penilai_tahap2: [{ id: 20 }, { id: 21 }], usulan_signatures: [{ id: 100 }] }), update: jest.fn() },
      user: { findUniqueOrThrow: jest.fn().mockResolvedValue({ role: 'UNIT', satker_id: 7, nama_lengkap: 'Nama akun' }) },
      satker: { findMany: jest.fn().mockResolvedValue([{ id: 7, nama_satker: 'BKK A' }, { id: 8, nama_satker: 'BKK B' }]) },
      usulinSignature: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), count: jest.fn().mockResolvedValue(1) },
    };
    service = new InovasiService(db as PrismaService);
  });
  it('menyimpan nama manual satker dan tidak memberi suara atau menyelesaikan penilaian', async () => {
    await service.sign(1, payload, { sub: 10 }, 2);
    expect(db.usulinSignature.create).toHaveBeenCalledWith({ data: expect.objectContaining({ user_id: 10, nama: 'Nama di BA, SKM', keputusan: null }) });
    expect(db.usulinSignature.count).toHaveBeenCalledWith({ where: { usulan_id: 1, tahap: 2, user_id: { in: [20, 21] } } });
    expect(db.inovasi.update).not.toHaveBeenCalled();
  });
  it('menolak satker lain', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({ role: 'UNIT', satker_id: 8 });
    await expect(service.sign(1, payload, { sub: 10 }, 2)).rejects.toThrow('tidak berhak');
    expect(db.usulinSignature.create).not.toHaveBeenCalled();
  });
  it('menolak nama kosong dan peran BKK milik unit lain', async () => {
    await expect(service.sign(1, { ...payload, nama: ' ' }, { sub: 10 }, 2)).rejects.toThrow('nama');
    await expect(service.sign(1, { ...payload, jabatan: 'Petugas BKK (BKK B)' }, { sub: 10 }, 2)).rejects.toThrow('peran');
  });
  it('unit Direktorat hanya dapat menandatangani sebagai Petugas Unit Eselon 1', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({ role: 'UNIT', satker_id: 7, nama_lengkap: 'Nama akun' });
    db.satker.findMany.mockResolvedValue([{ id: 7, nama_satker: 'Direktorat Kesehatan Lingkungan' }]);
    await expect(service.sign(1, { ...payload, jabatan: 'Petugas BKK (Direktorat Kesehatan Lingkungan)' }, { sub: 10 }, 2)).rejects.toThrow('peran');
    await service.sign(1, { ...payload, jabatan: 'Petugas Unit Eselon 1' }, { sub: 10 }, 2);
    expect(db.usulinSignature.create).toHaveBeenCalledWith({ data: expect.objectContaining({ jabatan: 'Petugas Unit Eselon 1', keputusan: null }) });
  });
  it('reviewer tidak dapat memilih peran milik unit', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({ role: 'REVIEWER', nama_lengkap: 'Nama akun' });
    await expect(service.sign(1, { ...payload, jabatan: 'Petugas Unit Eselon 1', keputusan: 'LOLOS' }, { sub: 20 }, 2)).rejects.toThrow('peran');
    await expect(service.sign(1, { ...payload, jabatan: 'Petugas BKK (BKK A)', keputusan: 'LOLOS' }, { sub: 20 }, 2)).rejects.toThrow('peran');
  });
  it('mewajibkan keputusan penilai dan menyelesaikan tahap setelah semua penilai menandatangani', async () => {
    db.user.findUniqueOrThrow.mockResolvedValue({ role: 'REVIEWER', nama_lengkap: 'Nama akun' });
    await expect(service.sign(1, { ...payload, jabatan: 'Dalnis Itjen' }, { sub: 20 }, 2)).rejects.toThrow('Lolos');
    db.usulinSignature.count.mockResolvedValue(2);
    await service.sign(1, { ...payload, jabatan: 'Dalnis Itjen', keputusan: 'LOLOS' }, { sub: 20 }, 2);
    expect(db.inovasi.update).toHaveBeenCalledWith({ where: { id: 1 }, data: { status_tahap2: 'SELESAI_EVALUASI' } });
  });
});
