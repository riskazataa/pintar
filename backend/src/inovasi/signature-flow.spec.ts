import { InovasiService } from './inovasi.service';
import { hasilPenilaian } from './hasil-penilaian';
import { ForbiddenException } from '@nestjs/common';

describe('Alur tanda tangan banyak penilai', () => {
  it('menunggu 15 akun, menyimpan NIP/peran/suara, menolak duplikat dan menghasilkan mayoritas', async () => {
    const penilai = Array.from({ length: 15 }, (_, i) => ({ id: i + 1 }));
    const signatures: any[] = [];
    const proposal = { id: 1, status: 'PENDING', penilai, penilai_tahap2: [] };
    const db: any = {
      $queryRaw: jest.fn(),
      inovasi: { findUnique: jest.fn(async () => proposal), update: jest.fn(async ({ data }) => Object.assign(proposal, data)) },
      user: { findUniqueOrThrow: jest.fn(async () => ({ nama_lengkap: 'Penilai' })) },
      usulinSignature: {
        findFirst: jest.fn(async ({ where }) => signatures.find((s) => s.user_id === where.user_id)),
        create: jest.fn(async ({ data }) => { signatures.push(data); return data; }),
        count: jest.fn(async () => signatures.length),
      },
      $transaction: jest.fn(async (fn) => fn(db)),
    };
    const service = new InovasiService(db);
    const dto = { usulan_inovasi_id: 1, user_id: 99, jabatan: 'Timker Manajemen Risiko, Reformasi Birokrasi dan Monev', nip: '198309072009121004', signature_data: 'data:image/png;base64,abc', keputusan: 'LOLOS' };
    for (let id = 1; id <= 15; id++) {
      await service.sign(1, { ...dto, keputusan: id <= 8 ? 'LOLOS' : 'TIDAK_LOLOS' }, { sub: id });
      expect(proposal.status).toBe(id < 15 ? 'PENDING' : 'SELESAI_EVALUASI');
    }
    expect(signatures).toHaveLength(15);
    expect(signatures[0]).toMatchObject({ user_id: 1, nip: dto.nip, jabatan: dto.jabatan, keputusan: 'LOLOS' });
    expect(hasilPenilaian(penilai, signatures)).toBe('LOLOS');
    await expect(service.sign(1, dto, { sub: 1 })).rejects.toThrow(ForbiddenException);
    await expect(service.sign(1, dto, { sub: 99 })).rejects.toThrow(ForbiddenException);
  });

  it('membuat BA beberapa halaman untuk 15 tanda tangan', async () => {
    const service = new InovasiService({ assessmentTemplatePackage: { findFirst: jest.fn().mockResolvedValue(null) } } as any);
    const signatures = Array.from({ length: 15 }, (_, i) => ({ tahap: 1, user_id: i + 1, nama: `Penilai ${i + 1}`, jabatan: 'Timker Manajemen Risiko, Reformasi Birokrasi dan Monev', nip: '198309072009121004', keputusan: 'LOLOS' }));
    jest.spyOn(service, 'findOne').mockResolvedValue({ judul: 'Inovasi', usulan_signatures: signatures, assessment_answers: [] } as any);
    const { buffer } = await service.generatePdf(1, 1);
    expect(buffer.toString().match(/\/Type \/Page\b/g)!.length).toBeGreaterThan(1);
  });
});
