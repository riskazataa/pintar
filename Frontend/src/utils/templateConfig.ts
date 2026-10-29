import type { Config } from '../services/workflow.service'

export function removeTemplateStage(config: Config, index: number): Config {
  if (config.stages.length <= 1 || index < 0 || index >= config.stages.length)
    throw new Error('Minimal satu tahap harus tersedia')
  const number = index + 1
  return {
    stages: config.stages.filter((_, i) => i !== index),
    mappings: config.mappings
      .filter(
        (m) =>
          m.source_stage !== number &&
          m.target_stage !== number &&
          !(number === 1 && m.source_stage === 0),
      )
      .map((m) => ({
        ...m,
        source_stage:
          m.source_stage > number ? m.source_stage - 1 : m.source_stage,
        target_stage:
          m.target_stage > number ? m.target_stage - 1 : m.target_stage,
      })),
  }
}

export function removeTemplateQuestion(
  config: Config,
  index: number,
  id: number,
): Config {
  const number = index + 1
  const removed = new Set(
    config.stages[index].questions
      .filter((q) => q.id === id || q.parent_id === id)
      .map((q) => q.id),
  )
  return {
    stages: config.stages.map((s, i) =>
      i === index
        ? { ...s, questions: s.questions.filter((q) => !removed.has(q.id)) }
        : s,
    ),
    mappings: config.mappings.filter(
      (m) =>
        !(m.target_stage === number && removed.has(m.target_id)) &&
        !(
          (m.source_stage === number ||
            (number === 1 && m.source_stage === 0)) &&
          removed.has(m.source_id)
        ),
    ),
  }
}
