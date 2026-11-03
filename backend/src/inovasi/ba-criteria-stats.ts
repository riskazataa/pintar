type Question = { id: number; parent_id: number | null; pertanyaan: string; is_header: boolean; urutan: number };
type Answer = { inovasi_id: number; question_id: number; jawaban_boolean: boolean; custom_values: unknown };

export function baCriteriaStats(questions: Question[], answers: Answer[], checkboxKey = 'jawaban_boolean') {
  const sorted = [...questions].sort((a, b) => a.urutan - b.urutan || a.id - b.id);
  const criteria = new Map<number, string>();
  let inCriteria = false;
  for (const root of sorted.filter((question) => question.parent_id === null)) {
    if (root.is_header) inCriteria = /\bkriteria\s+inovasi\b/i.test(root.pertanyaan);
    if (!inCriteria) continue;
    if (!root.is_header) criteria.set(root.id, root.pertanyaan);
    for (const child of sorted.filter((question) => question.parent_id === root.id && !question.is_header)) {
      criteria.set(child.id, child.pertanyaan);
    }
  }
  const counts = new Map<string, Set<number>>();
  for (const answer of answers) {
    const label = criteria.get(answer.question_id);
    if (!label) continue;
    const values = (answer.custom_values ?? {}) as Record<string, unknown>;
    const checked = Object.prototype.hasOwnProperty.call(values, checkboxKey)
      ? values[checkboxKey] === true : checkboxKey === 'jawaban_boolean' && answer.jawaban_boolean;
    if (!checked) continue;
    if (!counts.has(label)) counts.set(label, new Set());
    counts.get(label)!.add(answer.inovasi_id);
  }
  return Array.from(counts, ([label, innovations]) => ({ kriteria_inovasi: [label], total: innovations.size }));
}
