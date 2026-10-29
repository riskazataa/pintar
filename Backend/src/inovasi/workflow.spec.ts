import {
  assign,
  initialise,
  saveAnswers,
  sign,
  vote,
  returnToSelf,
  resubmit,
  workflowStatus,
  publicWorkflow,
  validateConfig,
  validateAnswers,
  normaliseWorkflow,
  type Config,
  type Workflow,
} from './workflow';
const image =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/RsAAAAASUVORK5CYII=';
const config = (): Config =>
  validateConfig({
    tahap1: [
      { id: 1, pertanyaan: 'Orisinil', parent_id: null },
      { id: 2, pertanyaan: 'Bukti', parent_id: 1 },
    ],
    tahap2: [
      { id: 10, pertanyaan: 'Dampak', parent_id: null },
      { id: 11, pertanyaan: 'Lanjutan', parent_id: 10 },
    ],
    mappings: [
      { source_stage: 0, source_id: 1, target_stage: 1, target_id: 1 },
      { source_stage: 0, source_id: 1, target_stage: 1, target_id: 2 },
      { source_stage: 1, source_id: 1, target_stage: 2, target_id: 10 },
      { source_stage: 0, source_id: 2, target_stage: 2, target_id: 11 },
    ],
  });
const self = () => [
  {
    question_id: 1,
    jawaban_boolean: true,
    catatan_string: 'Asli',
    link: 'https://example.com/orisinil',
  },
  {
    question_id: 2,
    jawaban_boolean: false,
    catatan_string: 'Bukti awal',
    link: '',
  },
];
function setup(ids = [1, 2, 3]) {
  const w = initialise(config(), self());
  assign(w, 1, ids);
  assign(w, 2, [2, 4]);
  return w;
}
function signature(w: Workflow, stage: number, id: number) {
  sign(w, stage, {
    user_id: id,
    nama: `Reviewer ${id}`,
    role: 'SKI',
    nip: '123',
    ttd_image: image,
    vote: null,
    signed_at: new Date().toISOString(),
  });
}
function finish1(w: Workflow, decisions = [true, true, false]) {
  w.stages[0].reviewer_ids.forEach((id, i) => {
    signature(w, 1, id);
    vote(w, 1, id, decisions[i]);
  });
}
describe('assessment dinamis', () => {
  it.each([1, 3, 5, 12])(
    'runs %i configured stages and finalises only the last stage',
    (count) => {
      const dynamic: Config = {
        stages: Array.from({ length: count }, (_, i) => ({
          nama: `Review ${i + 1}`,
          questions: [
            { id: i + 1, pertanyaan: `Kriteria ${i + 1}`, parent_id: null },
          ],
        })),
        mappings: Array.from({ length: count }, (_, i) => ({
          source_stage: i,
          source_id: i === 0 ? 1 : i,
          target_stage: i + 1,
          target_id: i + 1,
        })),
      };
      const w = initialise(dynamic, [self()[0]]);
      expect(w.stages).toHaveLength(count);
      expect(() => assign(w, count + 1, [1])).toThrow('Tahap tidak ditemukan');
      for (let n = 1; n <= count; n++) {
        expect(w.active).toBe(n);
        expect(w.stages[n - 1].answers[0].link).toBe(self()[0].link);
        expect(workflowStatus(w)).not.toBe('SELESAI_EVALUASI');
        assign(w, n, [1]);
        signature(w, n, 1);
        vote(w, n, 1, true);
      }
      expect(workflowStatus(w)).toBe('SELESAI_EVALUASI');
    },
  );
  it('reads old two-stage snapshots without changing the stored object', () => {
    const current = setup();
    const legacy = {
      ...current,
      version: 1,
      config: {
        tahap1: current.config.stages[0].questions,
        tahap2: current.config.stages[1].questions,
        mappings: current.config.mappings,
      },
    };
    const original = JSON.stringify(legacy);
    const w = normaliseWorkflow(legacy);
    expect(w.config.stages.map((s) => s.nama)).toEqual(['Tahap 1', 'Tahap 2']);
    expect(w.stages).toEqual(current.stages);
    expect(JSON.stringify(legacy)).toBe(original);
  });
  it('supports copying from any earlier stage and archives all dynamic stages on return', () => {
    const c = config();
    c.stages.push({
      nama: 'Review akhir',
      questions: [{ id: 20, pertanyaan: 'Kesimpulan', parent_id: null }],
    });
    c.mappings.push({
      source_stage: 1,
      source_id: 1,
      target_stage: 3,
      target_id: 20,
    });
    const w = initialise(c, self());
    assign(w, 1, [1]);
    assign(w, 2, [1]);
    assign(w, 3, [1]);
    signature(w, 1, 1);
    vote(w, 1, 1, true);
    signature(w, 2, 1);
    vote(w, 2, 1, true);
    expect(w.stages[2].answers[0].catatan_string).toBe('Asli');
    signature(w, 3, 1);
    returnToSelf(w, 1, 'Perbaikan tahap akhir');
    expect(w.history[0].stages).toHaveLength(3);
    expect(
      w.stages.every((s) => s.signatures.length === 0 && s.result === null),
    ).toBe(true);
    resubmit(
      w,
      self().map((a) => ({ ...a, catatan_string: 'Self terbaru' })),
    );
    expect(w.stages[2].answers[0].catatan_string).toBe('Asli');
  });
  it('stops later stages when a middle stage fails', () => {
    const c = config();
    c.stages.push({
      nama: 'Akhir',
      questions: [{ id: 20, pertanyaan: 'Kesimpulan', parent_id: null }],
    });
    const w = initialise(c, self());
    assign(w, 1, [1]);
    assign(w, 2, [1]);
    signature(w, 1, 1);
    vote(w, 1, 1, true);
    signature(w, 2, 1);
    vote(w, 2, 1, false);
    expect(workflowStatus(w)).toBe('REJECTED');
    expect(w.stages[2].created).toBe(false);
  });
  it('copies full rows to multiple targets while preserving self assessment', () => {
    const w = setup();
    expect(w.stages[0].answers[1]).toEqual({ ...self()[0], question_id: 2 });
    saveAnswers(
      w,
      1,
      1,
      w.stages[0].answers.map((a) => ({
        ...a,
        catatan_string: 'Hasil review',
      })),
    );
    expect(w.self).toEqual(self());
    finish1(w);
    expect(w.stages[1].answers[0].catatan_string).toBe('Hasil review');
    expect(w.stages[1].answers[1]).toEqual({ ...self()[1], question_id: 11 });
  });
  it('leaves unmapped rows blank and prevents signing incomplete answers', () => {
    const c = config();
    c.mappings = [];
    const w = initialise(c, self());
    assign(w, 1, [1]);
    expect(
      w.stages[0].answers.every(
        (a) => a.jawaban_boolean === null && a.link === '',
      ),
    ).toBe(true);
    expect(() => signature(w, 1, 1)).toThrow('Pilih Ya atau Tidak');
  });
  it('requires own signature and all votes; hides votes until final', () => {
    const w = setup();
    expect(() => vote(w, 1, 1, true)).toThrow('Tanda tangan terlebih dahulu');
    signature(w, 1, 1);
    vote(w, 1, 1, true);
    signature(w, 1, 2);
    vote(w, 1, 2, true);
    expect(w.stages[0].result).toBeNull();
    expect(
      publicWorkflow(w, 3).stages[0].signatures.every((s) => s.vote === null),
    ).toBe(true);
    expect(publicWorkflow(w, 1).stages[0].signatures[0].vote).toBe(true);
    signature(w, 1, 3);
    vote(w, 1, 3, false);
    expect(w.stages[0].result).toBe('LOLOS');
    expect(w.active).toBe(2);
    expect(publicWorkflow(w, 3).stages[0].signatures[0].vote).toBe(true);
  });
  it('fails a negative majority without opening stage two', () => {
    const w = setup();
    finish1(w, [false, false, true]);
    expect(workflowStatus(w)).toBe('REJECTED');
    expect(w.stages[1].created).toBe(false);
    expect(() => signature(w, 2, 2)).toThrow('tidak sedang aktif');
  });
  it('treats a tie as not passed', () => {
    const w = setup([1, 2]);
    finish1(w, [true, false]);
    expect(w.stages[0].result).toBe('TIDAK_LOLOS');
  });
  it('locks answers after first signature, permanent assignments and submitted votes', () => {
    const w = setup();
    signature(w, 1, 1);
    vote(w, 1, 1, true);
    expect(() => saveAnswers(w, 1, 2, w.stages[0].answers)).toThrow(
      'Isian terkunci',
    );
    expect(() => assign(w, 1, [4])).toThrow('tidak dapat diubah');
    expect(() => vote(w, 1, 1, false)).toThrow('Suara sudah dikirim');
    expect(() => signature(w, 1, 1)).toThrow('sudah menandatangani');
    expect(() => signature(w, 1, 99)).toThrow('bukan reviewer');
  });
  it('supports the same reviewer in both stages', () => {
    const w = setup();
    finish1(w);
    signature(w, 2, 2);
    vote(w, 2, 2, true);
    signature(w, 2, 4);
    vote(w, 2, 4, true);
    expect(workflowStatus(w)).toBe('SELESAI_EVALUASI');
    expect(w.stages[0].signatures.find((s) => s.user_id === 2)).toBeDefined();
  });
  it('returns directly to self, archives and resets signatures/votes, preserves drafts and never recopies', () => {
    const w = setup();
    finish1(w);
    saveAnswers(
      w,
      2,
      2,
      w.stages[1].answers.map((a) => ({
        ...a,
        catatan_string: 'Draf tahap dua',
      })),
    );
    signature(w, 2, 2);
    vote(w, 2, 2, false);
    returnToSelf(w, 4, 'Perbaiki bukti');
    expect(w.active).toBe(0);
    expect(workflowStatus(w)).toBe('PERBAIKAN');
    expect(w.history[0].stages[0].result).toBe('LOLOS');
    expect(
      w.stages.every((s) => s.signatures.length === 0 && s.result === null),
    ).toBe(true);
    expect(() => vote(w, 2, 2, true)).toThrow('tidak sedang aktif');
    resubmit(
      w,
      self().map((a) => ({ ...a, catatan_string: 'Self diperbaiki' })),
    );
    expect(w.stages[0].answers[0].catatan_string).toBe('Asli');
    finish1(w);
    expect(w.stages[1].answers[0].catatan_string).toBe('Draf tahap dua');
    expect(w.stages[1].reviewer_ids).toEqual([2, 4]);
    expect(w.history[0].self[0].catatan_string).toBe('Asli');
  });
  it('requires admin for final-result reopening and a return reason', () => {
    const w = setup();
    finish1(w, [false, false, true]);
    expect(() => returnToSelf(w, 1, 'Koreksi')).toThrow('tidak sedang aktif');
    expect(() => returnToSelf(w, 1, '', true)).toThrow('Alasan');
    returnToSelf(w, 99, 'Koreksi admin', true);
    expect(w.active).toBe(0);
  });
  it('rejects conflicting mappings, future sources, unknown questions and unsafe links', () => {
    const c = config();
    c.mappings.push({
      source_stage: 0,
      source_id: 2,
      target_stage: 1,
      target_id: 1,
    });
    expect(() => validateConfig(c)).toThrow('satu sumber');
    const c2 = config();
    c2.mappings[0].source_stage = 1;
    expect(() => validateConfig(c2)).toThrow('tahap sebelumnya');
    expect(() =>
      validateAnswers(config().stages[0].questions, [
        { ...self()[0], question_id: 99 },
      ]),
    ).toThrow('tidak sesuai');
    expect(() =>
      validateAnswers(
        config().stages[0].questions,
        self().map((a) => ({ ...a, link: 'javascript:alert(1)' })),
      ),
    ).toThrow('http/https');
  });
});
