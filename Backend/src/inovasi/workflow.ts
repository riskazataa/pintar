// A workflow is one transactional aggregate. Question/template snapshots and archived
// rounds stay with the submission; changing the published package cannot rewrite them.
export interface Question {
  id: number;
  pertanyaan: string;
  parent_id: number | null;
}
export interface Answer {
  question_id: number;
  jawaban_boolean: boolean | null;
  catatan_string: string;
  link: string;
}
export interface Mapping {
  source_stage: number;
  source_id: number;
  target_stage: number;
  target_id: number;
}
export interface StageTemplate {
  nama: string;
  questions: Question[];
}
export interface Config {
  stages: StageTemplate[];
  mappings: Mapping[];
}
export interface Signature {
  user_id: number;
  nama: string;
  role: string;
  nip: string;
  ttd_image: string;
  signed_at: string;
  vote: boolean | null;
  voted?: boolean;
}
export interface Stage {
  created: boolean;
  reviewer_ids: number[];
  answers: Answer[];
  signatures: Signature[];
  result: 'LOLOS' | 'TIDAK_LOLOS' | null;
}
export interface Workflow {
  version: 1 | 2;
  revision: number;
  active: number;
  round: number;
  config: Config;
  self: Answer[];
  stages: Stage[];
  history: {
    at: string;
    actor: number;
    reason: string;
    round: number;
    self: Answer[];
    stages: Stage[];
  }[];
}
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
// Accept published v1 snapshots without changing their meaning or stage order.
export function validateConfig(input: unknown): Config {
  const raw = input as Config & { tahap1?: Question[]; tahap2?: Question[] };
  check(raw && Array.isArray(raw.mappings), 'Konfigurasi template tidak valid');
  const templates = Array.isArray(raw.stages)
    ? raw.stages
    : Array.isArray(raw.tahap1) && Array.isArray(raw.tahap2)
      ? [
          { nama: 'Tahap 1', questions: raw.tahap1 },
          { nama: 'Tahap 2', questions: raw.tahap2 },
        ]
      : [];
  check(templates.length > 0, 'Tambahkan minimal satu tahap review');
  const config: Config = { stages: [], mappings: [] };
  for (const template of templates) {
    check(
      typeof template.nama === 'string' && template.nama.trim(),
      'Nama tahap wajib diisi',
    );
    const rows = template.questions;
    check(
      Array.isArray(rows) && rows.length > 0 && rows.length <= 300,
      'Setiap tahap memerlukan 1–300 pertanyaan',
    );
    const ids = new Set(rows.map((q) => q.id));
    check(ids.size === rows.length, 'ID pertanyaan harus unik dalam tahap');
    const questions = rows.map((q) => {
      check(
        Number.isSafeInteger(q.id) &&
          q.id > 0 &&
          typeof q.pertanyaan === 'string' &&
          q.pertanyaan.trim().length > 0,
        'Pertanyaan tidak valid',
      );
      check(
        q.parent_id === null ||
          (ids.has(q.parent_id) &&
            rows.some((p) => p.id === q.parent_id && p.parent_id === null)),
        'Induk pertanyaan harus berupa baris utama',
      );
      return {
        id: q.id,
        pertanyaan: q.pertanyaan.trim(),
        parent_id: q.parent_id,
      };
    });
    config.stages.push({ nama: template.nama.trim(), questions });
  }
  const targets = new Set<string>();
  for (const m of raw.mappings) {
    check(
      Number.isSafeInteger(m.source_stage) &&
        Number.isSafeInteger(m.target_stage) &&
        m.source_stage >= 0 &&
        m.source_stage < m.target_stage &&
        m.target_stage <= config.stages.length,
      'Sumber copy harus berasal dari tahap sebelumnya',
    );
    const source = config.stages[Math.max(0, m.source_stage - 1)].questions;
    const target = config.stages[m.target_stage - 1].questions;
    check(
      source.some((q) => q.id === m.source_id) &&
        target.some((q) => q.id === m.target_id),
      'Baris sumber/tujuan copy tidak ditemukan',
    );
    const key = m.target_stage + ':' + m.target_id;
    check(
      !targets.has(key),
      'Satu baris tujuan hanya boleh memiliki satu sumber',
    );
    targets.add(key);
    config.mappings.push({
      source_stage: m.source_stage,
      source_id: m.source_id,
      target_stage: m.target_stage,
      target_id: m.target_id,
    });
  }
  return config;
}
export function normaliseWorkflow(input: unknown): Workflow {
  const w = structuredClone(input) as Workflow;
  w.config = validateConfig(w.config);
  check(
    Array.isArray(w.stages) && w.stages.length === w.config.stages.length,
    'Jumlah tahap usulan tidak sesuai snapshot template',
  );
  w.version = 2;
  return w;
}
export function stageAt(w: Workflow, number: number): Stage {
  check(
    Number.isSafeInteger(number) && number >= 1 && number <= w.stages.length,
    'Tahap tidak ditemukan dalam template usulan',
  );
  return w.stages[number - 1];
}
export function validateAnswers(
  questions: Question[],
  input: Answer[],
  complete = true,
): Answer[] {
  check(Array.isArray(input), 'Jawaban harus berupa daftar');
  check(
    new Set(input.map((a) => a.question_id)).size === input.length &&
      input.every((a) => questions.some((q) => q.id === a.question_id)),
    'Pertanyaan jawaban tidak sesuai template',
  );
  if (complete)
    check(input.length === questions.length, 'Lengkapi semua baris assessment');
  return questions.map((q) => {
    const a = input.find((v) => v.question_id === q.id);
    check(
      !complete || typeof a?.jawaban_boolean === 'boolean',
      'Pilih Ya atau Tidak pada setiap baris',
    );
    check(
      !a ||
        a.jawaban_boolean === null ||
        typeof a.jawaban_boolean === 'boolean',
      'Jawaban harus Ya atau Tidak',
    );
    check(
      !a || typeof a.catatan_string === 'string' || a.catatan_string == null,
      'Catatan harus berupa teks',
    );
    check(
      !a || typeof a.link === 'string' || a.link == null,
      'Link harus berupa teks',
    );
    const link = a?.link?.trim() || '';
    if (link) {
      let url: URL;
      try {
        url = new URL(link);
      } catch {
        throw new Error('Link harus berupa URL http/https yang valid');
      }
      check(
        ['https:', 'http:'].includes(url.protocol),
        'Link hanya menerima http/https',
      );
    }
    return {
      question_id: q.id,
      jawaban_boolean: a?.jawaban_boolean ?? null,
      catatan_string: a?.catatan_string || '',
      link,
    };
  });
}
export function startStage(w: Workflow, number: number) {
  const stage = stageAt(w, number);
  if (stage.created) return; // Never re-copy on a resubmission.
  const questions = w.config.stages[number - 1].questions;
  stage.answers = validateAnswers(questions, [], false);
  for (const m of w.config.mappings.filter((m) => m.target_stage === number)) {
    const source = (
      m.source_stage === 0 ? w.self : w.stages[m.source_stage - 1].answers
    ).find((a) => a.question_id === m.source_id);
    if (source)
      stage.answers[questions.findIndex((q) => q.id === m.target_id)] = {
        ...source,
        question_id: m.target_id,
      };
  }
  stage.created = true;
}
export function initialise(config: Config, self: Answer[]): Workflow {
  const stage = (): Stage => ({
    created: false,
    reviewer_ids: [],
    answers: [],
    signatures: [],
    result: null,
  });
  const w: Workflow = {
    version: 2,
    revision: 0,
    active: 1,
    round: 1,
    config: validateConfig(config),
    self: [],
    stages: [],
    history: [],
  };
  w.stages = w.config.stages.map(() => stage());
  w.self = validateAnswers(w.config.stages[0].questions, self);
  startStage(w, 1);
  return w;
}
export function assign(w: Workflow, number: number, ids: number[]) {
  const s = stageAt(w, number);
  check(
    s.reviewer_ids.length === 0,
    'Reviewer sudah ditetapkan dan tidak dapat diubah',
  );
  check(
    ids.length > 0 &&
      new Set(ids).size === ids.length &&
      ids.every(Number.isSafeInteger),
    'Pilih minimal satu reviewer yang berbeda',
  );
  s.reviewer_ids = [...ids];
}
export function activeStage(w: Workflow, number: number, user: number): Stage {
  const s = stageAt(w, number);
  check(
    w.active === number && s.created && !s.result,
    'Tahap ini tidak sedang aktif',
  );
  check(s.reviewer_ids.includes(user), 'Anda bukan reviewer tahap ini');
  return s;
}
export function saveAnswers(
  w: Workflow,
  number: number,
  user: number,
  answers: Answer[],
) {
  const s = activeStage(w, number, user);
  check(
    s.signatures.length === 0,
    'Isian terkunci setelah tanda tangan pertama',
  );
  s.answers = validateAnswers(
    w.config.stages[number - 1].questions,
    answers,
    false,
  );
}
export function sign(w: Workflow, number: number, signature: Signature) {
  const s = activeStage(w, number, signature.user_id);
  check(
    !s.signatures.some((v) => v.user_id === signature.user_id),
    'Anda sudah menandatangani tahap ini',
  );
  validateAnswers(w.config.stages[number - 1].questions, s.answers);
  check(
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(signature.ttd_image) &&
      signature.ttd_image.length <= 500000,
    'Tanda tangan PNG tidak valid atau terlalu besar',
  );
  check(
    signature.nip.trim() && signature.role.trim(),
    'NIP dan jabatan wajib diisi',
  );
  s.signatures.push({ ...signature, vote: null });
}
export function vote(
  w: Workflow,
  number: number,
  user: number,
  choice: boolean,
) {
  const s = activeStage(w, number, user);
  const signature = s.signatures.find((v) => v.user_id === user);
  check(signature, 'Tanda tangan terlebih dahulu');
  check(
    signature.vote === null && typeof choice === 'boolean',
    'Suara sudah dikirim atau pilihan tidak valid',
  );
  signature.vote = choice;
  if (
    s.signatures.length === s.reviewer_ids.length &&
    s.signatures.every((v) => v.vote !== null)
  ) {
    s.result =
      s.signatures.filter((v) => v.vote === true).length >
      s.reviewer_ids.length / 2
        ? 'LOLOS'
        : 'TIDAK_LOLOS';
    if (number < w.stages.length && s.result === 'LOLOS') {
      w.active = number + 1;
      startStage(w, number + 1);
    }
  }
}
export function returnToSelf(
  w: Workflow,
  user: number,
  reason: string,
  admin = false,
) {
  check(
    typeof reason === 'string' && reason.trim().length > 0,
    'Alasan pengembalian wajib diisi',
  );
  check(w.active !== 0, 'Usulan sudah dalam perbaikan satker');
  if (!admin) activeStage(w, w.active, user);
  w.history.push({
    at: new Date().toISOString(),
    actor: user,
    reason: reason.trim(),
    round: w.round,
    self: structuredClone(w.self),
    stages: structuredClone(w.stages),
  });
  w.stages.forEach((s) => {
    s.signatures = [];
    s.result = null;
  });
  w.active = 0;
  w.round++;
}
export function resubmit(w: Workflow, answers: Answer[]) {
  check(w.active === 0, 'Usulan tidak sedang dikembalikan ke satker');
  w.self = validateAnswers(w.config.stages[0].questions, answers);
  w.active = 1;
}
export function publicWorkflow(w: Workflow, user: number): Workflow {
  const copy = normaliseWorkflow(w);
  for (const stage of copy.stages) {
    for (const s of stage.signatures) {
      s.voted = s.vote !== null;
      if (!stage.result && s.user_id !== user) s.vote = null;
    }
  }
  return copy;
}
export function workflowStatus(
  w: Workflow,
): 'PENDING' | 'APPROVED' | 'REJECTED' | 'PERBAIKAN' | 'SELESAI_EVALUASI' {
  if (w.active === 0) return 'PERBAIKAN';
  if (w.stages.some((s) => s.result === 'TIDAK_LOLOS')) return 'REJECTED';
  if (w.stages[w.stages.length - 1].result === 'LOLOS')
    return 'SELESAI_EVALUASI';
  return w.active > 1 ? 'APPROVED' : 'PENDING';
}
