import { baCriteriaStats } from './ba-criteria-stats';

describe('BA satker criteria statistics', () => {
  const questions = [
    { id: 1, parent_id: null, pertanyaan: 'B. Kriteria Inovasi', is_header: true, urutan: 1 },
    { id: 2, parent_id: null, pertanyaan: 'Bermanfaat', is_header: false, urutan: 2 },
    { id: 3, parent_id: 2, pertanyaan: 'Berkelanjutan', is_header: false, urutan: 1 },
    { id: 4, parent_id: null, pertanyaan: 'C. Kategori Inovasi', is_header: true, urutan: 3 },
    { id: 5, parent_id: null, pertanyaan: 'Kategori lain', is_header: false, urutan: 4 },
  ];
  it('counts only checked criteria, respects explicit unchecks, and counts each innovation once', () => {
    expect(baCriteriaStats(questions, [
      { inovasi_id: 10, question_id: 2, jawaban_boolean: true, custom_values: {} },
      { inovasi_id: 10, question_id: 2, jawaban_boolean: true, custom_values: {} },
      { inovasi_id: 11, question_id: 2, jawaban_boolean: true, custom_values: { jawaban_boolean: false } },
      { inovasi_id: 12, question_id: 3, jawaban_boolean: false, custom_values: { jawaban_boolean: true } },
      { inovasi_id: 10, question_id: 5, jawaban_boolean: true, custom_values: {} },
    ])).toEqual([
      { kriteria_inovasi: ['Bermanfaat'], total: 1 },
      { kriteria_inovasi: ['Berkelanjutan'], total: 1 },
    ]);
  });
  it('reads a configured checkbox column from the BA', () => {
    expect(baCriteriaStats(questions, [
      { inovasi_id: 10, question_id: 2, jawaban_boolean: false, custom_values: { ceklis: true } },
    ], 'ceklis')).toEqual([{ kriteria_inovasi: ['Bermanfaat'], total: 1 }]);
  });
});
