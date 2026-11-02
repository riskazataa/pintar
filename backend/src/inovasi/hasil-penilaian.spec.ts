import { hasilPenilaian } from './hasil-penilaian';

describe('Keputusan Tahap 1', () => {
  const penilai = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const votes = (values: string[]) => values.map((keputusan, i) => ({ user_id: i + 1, tahap: 1, keputusan }));
  it('meloloskan mayoritas 2 dari 3', () => expect(hasilPenilaian(penilai, votes(['LOLOS', 'LOLOS', 'TIDAK_LOLOS']))).toBe('LOLOS'));
  it('tidak meloloskan mayoritas suara tidak', () => expect(hasilPenilaian(penilai, votes(['LOLOS', 'TIDAK_LOLOS', 'TIDAK_LOLOS']))).toBe('TIDAK_LOLOS'));
  it('menunggu semua penilai dan tidak mengarang keputusan data lama', () => {
    expect(hasilPenilaian(penilai, votes(['LOLOS', 'LOLOS']))).toBeNull();
    expect(hasilPenilaian(penilai, votes(['LOLOS', 'LOLOS', '']))).toBeNull();
  });
  it('menghitung suara seri sebagai tidak lolos', () => expect(hasilPenilaian(penilai.slice(0, 2), votes(['LOLOS', 'TIDAK_LOLOS']))).toBe('TIDAK_LOLOS'));
  it('mendukung lebih dari sepuluh penilai dan mengabaikan suara dari tahap lain', () => {
    const assigned = Array.from({ length: 15 }, (_, i) => ({ id: i + 1 }));
    const signatures = votes(Array.from({ length: 15 }, (_, i) => i < 8 ? 'LOLOS' : 'TIDAK_LOLOS'));
    expect(hasilPenilaian(assigned, [...signatures, { user_id: 99, tahap: 1, keputusan: 'TIDAK_LOLOS' }])).toBe('LOLOS');
    expect(hasilPenilaian(assigned, signatures.map((s) => ({ ...s, tahap: 2 })))).toBeNull();
  });
  it('menghitung mayoritas untuk Tahap 2 dengan pola yang sama', () => {
    const stageTwoVotes = votes(['TIDAK_LOLOS', 'LOLOS', 'LOLOS']).map((vote) => ({ ...vote, tahap: 2 }));
    expect(hasilPenilaian(penilai, stageTwoVotes, 2)).toBe('LOLOS');
    expect(hasilPenilaian(penilai, stageTwoVotes.slice(0, 2), 2)).toBeNull();
    expect(hasilPenilaian(penilai, votes(['LOLOS', 'LOLOS', 'TIDAK_LOLOS']), 2)).toBeNull();
    expect(hasilPenilaian(penilai.slice(0, 2), stageTwoVotes.slice(0, 2).map((vote, i) => ({ ...vote, keputusan: i ? 'TIDAK_LOLOS' : 'LOLOS' })), 2)).toBe('TIDAK_LOLOS');
  });
});
