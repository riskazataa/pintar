import { useState } from 'react'
import StageAssessment from '../tim-penilai/StageAssessment'
export default function Hasil() {
  const [stage, setStage] = useState<1 | 2>(1)
  return <div className="space-y-4"><div className="flex gap-3">{([1, 2] as const).map(value => <button key={value} className={`rounded border px-4 py-2 ${stage === value ? 'bg-blue-600 text-white' : 'bg-white'}`} onClick={() => setStage(value)}>Tahap {value}</button>)}</div><StageAssessment stage={stage} resultsOnly /></div>
}
