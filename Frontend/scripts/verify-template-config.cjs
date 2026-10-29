const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const source = ts.transpile(fs.readFileSync('src/utils/templateConfig.ts', 'utf8'), { module: ts.ModuleKind.CommonJS })
const exportsObject = {}
new Function('exports', source)(exportsObject)
const { removeTemplateStage, removeTemplateQuestion } = exportsObject
const config = {
  stages: [1, 2, 3, 4].map(n => ({ nama: `Tahap ${n}`, questions: [{ id: 1, pertanyaan: 'Induk', parent_id: null }, { id: 2, pertanyaan: 'Anak', parent_id: 1 }] })),
  mappings: [
    { source_stage: 0, source_id: 1, target_stage: 1, target_id: 1 },
    { source_stage: 1, source_id: 1, target_stage: 3, target_id: 1 },
    { source_stage: 2, source_id: 2, target_stage: 3, target_id: 2 },
    { source_stage: 0, source_id: 2, target_stage: 4, target_id: 1 },
    { source_stage: 3, source_id: 1, target_stage: 4, target_id: 2 },
  ],
}
const original = JSON.stringify(config)
const middle = removeTemplateStage(config, 1)
assert.deepEqual(middle.stages.map(s => s.nama), ['Tahap 1', 'Tahap 3', 'Tahap 4'])
assert.deepEqual(middle.mappings, [
  config.mappings[0],
  { ...config.mappings[1], target_stage: 2 },
  { ...config.mappings[3], target_stage: 3 },
  { ...config.mappings[4], source_stage: 2, target_stage: 3 },
])
const first = removeTemplateStage(config, 0)
assert.ok(first.mappings.every(m => m.source_stage !== 0))
assert.deepEqual(first.mappings, [
  { ...config.mappings[2], source_stage: 1, target_stage: 2 },
  { ...config.mappings[4], source_stage: 2, target_stage: 3 },
])
const deleted = removeTemplateQuestion(config, 0, 1)
assert.equal(deleted.stages[0].questions.length, 0)
assert.equal(deleted.stages[1].questions.length, 2)
assert.deepEqual(deleted.mappings, [config.mappings[2], config.mappings[4]])
assert.equal(JSON.stringify(config), original, 'Editing a new version must not mutate the original package')
assert.throws(() => removeTemplateStage({ stages: [config.stages[0]], mappings: [] }, 0))
console.log('PASS: dynamic stage/question removal preserves valid mappings, drops affected sources and keeps original versions immutable')
