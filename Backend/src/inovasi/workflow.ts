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
  source_stage: 0 | 1;
  source_id: number;
  target_stage: 1 | 2;
  target_id: number;
}
export interface Config {
  tahap1: Question[];
  tahap2: Question[];
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
  version: 1;
  revision: number;
  active: 0 | 1 | 2;
  round: number;
  config: Config;
  self: Answer[];
  stages: [Stage, Stage];
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
export function validateConfig(input: Config): Config {
  check(
    input &&
      Array.isArray(input.tahap1) &&
      Array.isArray(input.tahap2) &&
      Array.isArray(input.mappings),
    'Konfigurasi template tidak valid',
  );
  const config: Config = { tahap1: [], tahap2: [], mappings: [] };
  for (const key of ['tahap1', 'tahap2'] as const) {
    const rows = input[key];
    check(
      rows.length > 0 && rows.length <= 300,
      'Setiap tahap memerlukan 1–300 pertanyaan',
    );
    const ids = new Set(rows.map((q) => q.id));
    check(ids.size === rows.length, 'ID pertanyaan harus unik dalam tahap');
    config[key] = rows.map((q) => {
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
  }
  const targets = new Set<string>();
  for (const m of input.mappings) {
    check(
      (m.target_stage === 1 && m.source_stage === 0) ||
        (m.target_stage === 2 && [0, 1].includes(m.source_stage)),
      'Sumber copy harus berasal dari tahap sebelumnya',
    );
    const source =
      m.source_stage === 0 || m.source_stage === 1 ? config.tahap1 : [];
    const target = m.target_stage === 1 ? config.tahap1 : config.tahap2;
    check(
      source.some((q) => q.id === m.source_id) &&
        target.some((q) => q.id === m.target_id),
      'Baris sumber/tujuan copy tidak ditemukan',
    );
    const key = `${m.target_stage}:${m.target_id}`;
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
export function startStage(w: Workflow, number: 1 | 2) {
  const stage = w.stages[number - 1];
  if (stage.created) return; // Never re-copy on a resubmission.
  const questions = number === 1 ? w.config.tahap1 : w.config.tahap2;
  stage.answers = validateAnswers(questions, [], false);
  for (const m of w.config.mappings.filter((m) => m.target_stage === number)) {
    const source = (m.source_stage === 0 ? w.self : w.stages[0].answers).find(
      (a) => a.question_id === m.source_id,
    );
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
    version: 1,
    revision: 0,
    active: 1,
    round: 1,
    config: validateConfig(config),
    self: [],
    stages: [stage(), stage()],
    history: [],
  };
  w.self = validateAnswers(w.config.tahap1, self);
  startStage(w, 1);
  return w;
}
export function assign(w: Workflow, number: 1 | 2, ids: number[]) {
  const s = w.stages[number - 1];
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
export function activeStage(w: Workflow, number: 1 | 2, user: number): Stage {
  const s = w.stages[number - 1];
  check(
    w.active === number && s.created && !s.result,
    'Tahap ini tidak sedang aktif',
  );
  check(s.reviewer_ids.includes(user), 'Anda bukan reviewer tahap ini');
  return s;
}
export function saveAnswers(
  w: Workflow,
  number: 1 | 2,
  user: number,
  answers: Answer[],
) {
  const s = activeStage(w, number, user);
  check(
    s.signatures.length === 0,
    'Isian terkunci setelah tanda tangan pertama',
  );
  s.answers = validateAnswers(
    number === 1 ? w.config.tahap1 : w.config.tahap2,
    answers,
    false,
  );
}
export function sign(w: Workflow, number: 1 | 2, signature: Signature) {
  const s = activeStage(w, number, signature.user_id);
  check(
    !s.signatures.some((v) => v.user_id === signature.user_id),
    'Anda sudah menandatangani tahap ini',
  );
  validateAnswers(number === 1 ? w.config.tahap1 : w.config.tahap2, s.answers);
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
  number: 1 | 2,
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
    if (number === 1 && s.result === 'LOLOS') {
      w.active = 2;
      startStage(w, 2);
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
  if (!admin) activeStage(w, w.active as 1 | 2, user);
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
  w.self = validateAnswers(w.config.tahap1, answers);
  w.active = 1;
}
export function publicWorkflow(w: Workflow, user: number): Workflow {
  const copy = structuredClone(w);
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
  if (w.stages[1].result === 'LOLOS') return 'SELESAI_EVALUASI';
  return w.active === 2 ? 'APPROVED' : 'PENDING';
}
