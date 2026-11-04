import api from '../api/axios'

export const getStatsInovasi = (tahun?: number) => api.get('/inovasi/stats', { params: { tahun } })

export const getUsulanList = (params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
  hasil?: string
  startDate?: string
  endDate?: string
  satker_id?: number | string
  tahap?: number
  tahun?: number
  assignedToMe?: boolean
  sort_order?: 'asc' | 'desc'
}) => {
  const { startDate, endDate, ...query } = params ?? {}
  return api.get('/inovasi', { params: { ...query, start_date: startDate, end_date: endDate } })
}

export type AssessmentAnswerView = 'self-assessment' | 'evaluation'

export const getUsulanDetail = (id: string | number, tahap = 1, view?: AssessmentAnswerView) =>
  api.get(`/inovasi/${id}`, { params: { tahap, ...(view ? { view } : {}) } })

export const createUsulan = (data: any) => api.post('/inovasi', data)

export const updateUsulan = (id: string | number, data: any) => {
  return api.patch(`/inovasi/${id}`, data); 
}

export const deleteUsulan = (id: string) => api.delete(`/inovasi/${id}`)

export const getAssessmentQuestions = (tahap = 1) => api.get('/assessment/questions', { params: { tahap } })

export const createAssessmentQuestion = (data: { pertanyaan: string; satker_lock_mode?: 'NONE' | 'RINCIAN' | 'ROW'; is_header?: boolean; question_title_override?: string; column_titles?: string[]; tahap?: number; parent_id?: string | number | null }) =>
  api.post('/assessment/questions', data)

export const createAssessmentQuestions = (rows: { pertanyaan: string; tahap: number; section_header_id?: number | null }[]) =>
  api.post('/assessment/questions/bulk', { rows })

export const reorderAssessmentQuestions = (tahap: number, parent_id: number | null, ids: number[]) =>
  api.put('/assessment/questions/order', { tahap, parent_id, ids })

export const updateAssessmentQuestion = (id: string | number, data: { pertanyaan: string; satker_lock_mode?: 'NONE' | 'RINCIAN' | 'ROW'; is_header?: boolean; question_title_override?: string; column_titles?: string[]; tahap?: number; parent_id?: string | number | null }) =>
  api.put(`/assessment/questions/${id}`, data)

export const deleteAssessmentQuestion = (id: string, tahap = 1) =>
  api.delete(`/assessment/questions/${id}`, { params: { tahap } })

  export const deleteAssessmentQuestions = (ids: number[]) =>
    api.delete('/assessment/questions', { data: { ids } })

export const getAkunTimPenilai = () => api.get('/auth/tim-penilai')

export const assignPenilai = (id: string | number, penilaiIds: (string | number)[], tahap = 1) => {
  return api.patch(`/inovasi/${id}/assign`, { penilai_ids: penilaiIds }, { params: { tahap } });
}

export const savePenilaian = (id: string | number, answers: any[], tahap = 1) =>
  api.patch(`/inovasi/${id}/assessment-penilai`, { answers }, { params: { tahap } })

export const updateAssessmentAnswers = (id: string | number, data: { assessment_answers: any[] }) =>
  api.patch(`/inovasi/${id}/assessment`, data)

export const kembalikanUsulan = (id: string | number, catatan: string) =>
  api.patch(`/inovasi/${id}/perbaikan`, { catatan_perbaikan: catatan })

export const lanjutkanUsulan = (id: string | number) =>
  api.patch(`/inovasi/${id}/lanjut`)

export const getUsulanSelesai = (params?: {
  page?: number
  limit?: number
  search?: string
  startDate?: string
  endDate?: string
  satker_id?: number | string
  hasil?: string
  tahap?: number
  tahun?: number
  sort_order?: 'asc' | 'desc'
}) => {
  const { startDate, endDate, ...query } = params ?? {}
  return api.get('/inovasi', { params: { ...query, status: 'SELESAI_EVALUASI', start_date: startDate, end_date: endDate } })
}

export const downloadHasilEvaluasiPdf = (id: string | number, tahap = 1) =>
  api.get(`/inovasi/${id}/pdf`, { responseType: 'blob', params: { tahap } })

export const simpanTandaTangan = async (id: string, data: { 
  usulan_inovasi_id: number; 
  user_id: number; 
  jabatan: string; 
  nip: string; 
  signature_data: string;
  nama?: string;
  keputusan?: 'LOLOS' | 'TIDAK_LOLOS';
}, tahap = 1) => api.patch(`/inovasi/${id}/sign`, data, { params: { tahap } }) // Ubah ke patch dan /sign

export interface BAColumn {
  key: string
  title: string
  type: 'readonly' | 'text' | 'textarea' | 'number' | 'score' | 'select' | 'radio' | 'checkbox' | 'date' | 'url'
  required: boolean
  options?: string[]
  defaultValue?: string
}
export interface BAReportHeader { title?: string; dateText?: string; logo?: string }
export const getBAColumns = (tahap = 1) => api.get<{ columns: BAColumn[]; questionTitle?: string; inheritedColumnKeys?: string[]; reportHeader?: BAReportHeader }>('/assessment/columns', { params: { tahap } })
export const saveBAColumns = (tahap: number, columns: BAColumn[], questionTitle?: string, reportHeader?: BAReportHeader) => api.put('/assessment/columns', { columns, questionTitle, reportHeader }, { params: { tahap } })
