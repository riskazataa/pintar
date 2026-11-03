import { orderFinalSignatureGroups } from './final-signature-order';

describe('Urutan tanda tangan penilaian akhir', () => {
  it('mengelompokkan peran PDF sesuai dua kolom BA dan mempertahankan urutan role walau input acak', () => {
    const { left, right } = orderFinalSignatureGroups([
      { jabatan: 'Biro Perencanaan', nama: 'Biro' },
      { jabatan: 'Ketua Tim Kerja Monev I Biro Perencanaan', nama: 'Monev' },
      { jabatan: 'Petugas Unit Eselon 1', nama: 'Eselon' },
      { jabatan: 'Dalnis Itjen', nama: 'Dalnis' },
      { jabatan: 'Petugas BKK (BBKK Soetta)', nama: 'BKK' },
      { jabatan: 'Ketua Tim Itjen', nama: 'Ketua' },
      { jabatan: 'Ketua Tim Kerja Marvel', nama: 'Marvel' },
      { jabatan: 'Anggota Tim Itjen', nama: 'Anggota' },
    ]);

    expect(left.map((group) => group.role)).toEqual([
      'Petugas BKK (BBKK Soetta)',
      'Petugas Unit Eselon 1',
      'Ketua Tim Kerja Marvel',
      'Ketua Tim Kerja Monev I Biro Perencanaan',
    ]);
    expect(right.map((group) => group.role)).toEqual([
      'Dalnis Itjen',
      'Ketua Tim Itjen',
      'Anggota Tim Itjen',
      'Biro Perencanaan',
    ]);
  });

  it('menggabungkan label lama Roren dalam grup Biro Perencanaan', () => {
    const { right } = orderFinalSignatureGroups([
      { jabatan: 'Roren', nama: 'Lama' },
      { jabatan: 'Biro Perencanaan', nama: 'Baru' },
    ]);
    expect(right).toHaveLength(1);
    expect(right[0].role).toBe('Biro Perencanaan');
    expect(right[0].signatures).toHaveLength(2);
  });
});
