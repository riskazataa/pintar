import { composeStage2Answers } from './stage2-assessment';

describe('Kelanjutan hasil Tahap 1', () => {
  const source = [
    { id: 11, tahap: 1, question_id: 1, question: { id: 1, pertanyaan: 'Kriteria awal', parent_id: null }, jawaban_boolean: false, catatan_string: 'Catatan Tahap 1', link: 'https://example.org/bukti', custom_values: { skor: 0, hasil: false } },
    { id: 12, tahap: 1, question_id: 2, question: { id: 2, pertanyaan: 'Subkriteria', parent_id: 1 }, jawaban_boolean: true, catatan_string: 'Sudah diperiksa' },
  ];
  const addition = { id: 20, pertanyaan: 'Kriteria tambahan', parent_id: null };

  it('membawa seluruh nilai dan hubungan subpertanyaan ketika belum ada jawaban Tahap 2', () => {
    const result = composeStage2Answers(source, [], []);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ ...source[0], id: 'q-1', tahap: 2, source_stage: 1 });
    expect(result[1].question.parent_id).toBe(1);
  });

  it('menambah pertanyaan kosong tanpa mengubah atau menggeser jawaban sumber', () => {
    const result = composeStage2Answers(source, [], [addition]);
    expect(result.map((answer) => answer.question_id)).toEqual([1, 2, 20]);
    expect(result[0].custom_values).toEqual({ skor: 0, hasil: false });
    expect(result[2]).toMatchObject({ question_id: 20, tahap: 2, jawaban_boolean: false, catatan_string: '', custom_values: {}, source_stage: 2 });
    expect(source[0].tahap).toBe(1);
  });

  it('mempertahankan perubahan Tahap 2 saat pertanyaan baru ditambahkan kemudian', () => {
    const saved = [{ ...source[0], id: 30, tahap: 2, catatan_string: 'Diperbarui Tahap 2', custom_values: { skor: 5 } }];
    const result = composeStage2Answers(source, saved, [addition]);
    expect(result[0]).toMatchObject({ id: 30, catatan_string: 'Diperbarui Tahap 2', custom_values: { skor: 5 } });
    expect(result[1].catatan_string).toBe('Sudah diperiksa');
    expect(source[0].catatan_string).toBe('Catatan Tahap 1');
  });
});
