type Question = { id: number; pertanyaan: string; parent_id: number | null; tahap?: number };
type Answer = {
  id: number | string;
  question_id: number;
  question: Question;
  tahap: number;
  jawaban_boolean: boolean;
  catatan_string?: string | null;
  link?: string | null;
  custom_values?: unknown;
};

// Match by question ID, so additions never shift values to a different row.
export function composeStage2Answers(source: Answer[], saved: Answer[], additions: Question[]) {
  const savedByQuestion = new Map(saved.map((answer) => [answer.question_id, answer]));
  const inherited = source.map((answer) => ({
    ...answer,
    ...savedByQuestion.get(answer.question_id),
    id: savedByQuestion.get(answer.question_id)?.id ?? `q-${answer.question_id}`,
    tahap: 2,
    question: answer.question,
    source_stage: 1,
  }));
  return [
    ...inherited,
    ...additions.filter((question) => !source.some((answer) => answer.question_id === question.id)).map((question) => ({
      id: `q-${question.id}` as number | string,
      question_id: question.id,
      tahap: 2,
      jawaban_boolean: false,
      catatan_string: '',
      link: '',
      custom_values: {} as unknown,
      ...savedByQuestion.get(question.id),
      question,
      source_stage: 2,
    })),
  ];
}
