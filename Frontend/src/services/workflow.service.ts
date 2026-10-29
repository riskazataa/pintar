import api from '../api/axios'
export interface Question {
  id: number
  pertanyaan: string
  parent_id: number | null
}
export interface Answer {
  question_id: number
  jawaban_boolean: boolean | null
  catatan_string: string
  link: string
}
export interface Mapping {
  source_stage: number
  source_id: number
  target_stage: number
  target_id: number
}
export interface Config {
  tahap1: Question[]
  tahap2: Question[]
  mappings: Mapping[]
}
export interface Signature {
  user_id: number
  nama: string
  role: string
  nip: string
  ttd_image: string
  vote: boolean | null
  signed_at: string
  voted?: boolean
}
export interface Stage {
  created: boolean
  reviewer_ids: number[]
  answers: Answer[]
  signatures: Signature[]
  result: 'LOLOS' | 'TIDAK_LOLOS' | null
}
export interface Workflow {
  revision: number
  active: number
  round: number
  config: Config
  self: Answer[]
  stages: Stage[]
  history: {
    at: string
    actor: number
    reason: string
    round: number
    self: Answer[]
    stages: Stage[]
  }[]
}
export interface Package {
  id: number
  nama: string
  config: Config
  published_at: string | null
  used_at: string | null
}
export interface Detail {
  id: number
  judul: string
  satker: { nama_satker: string }
  template: string
  status: string
  catatan_perbaikan: string | null
  workflow: Workflow
  reviewers: { id: number; nama_lengkap: string }[]
}
export const activePackage = () =>
  api.get<Package | null>('/assessment-workflow/templates/active')
export const packages = () =>
  api.get<Package[]>('/assessment-workflow/templates')
export const createPackage = (nama: string, config: Config) =>
  api.post<Package>('/assessment-workflow/templates', { nama, config })
export const publishPackage = (id: number) =>
  api.post(`/assessment-workflow/templates/${id}/publish`)
export const workflowDetail = (id: number | string) =>
  api.get<Detail>(`/assessment-workflow/inovasi/${id}`)
export const workflowAction = (
  id: number,
  stage: number,
  action: string,
  revision: number,
  payload: object,
) =>
  api.post<Detail>(
    `/assessment-workflow/inovasi/${id}/stages/${stage}/${action}`,
    { revision, ...payload },
  )
export function ordered(questions: Question[]) {
  return questions
    .filter((q) => q.parent_id === null)
    .flatMap((q, i) => [
      { ...q, no: String(i + 1) },
      ...questions
        .filter((c) => c.parent_id === q.id)
        .map((c, j) => ({
          ...c,
          no: `${i + 1}.${String.fromCharCode(97 + j)}`,
        })),
    ])
}
