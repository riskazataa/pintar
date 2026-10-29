import api from '../api/axios'

export const getStatsInovasi = () => api.get('/inovasi/stats')

export const getUsulanList = (params?: {
  page?: number
  limit?: number
  search?: string
  status?: string
  startDate?: string
  endDate?: string
  assignedToMe?: boolean
}) => api.get('/inovasi', { params })

// Fungsi getUsulanDetail cukup 1 ini saja
export const getUsulanDetail = (id: string | number) => api.get(`/inovasi/${id}`)

export const createUsulan = (data: any) => api.post('/inovasi', data)

export const updateUsulan = (id: string | number, data: any) => {
  return api.patch(`/inovasi/${id}`, data); 
}

export const deleteUsulan = (id: string) => api.delete(`/inovasi/${id}`)

export const getAssessmentQuestions = () => api.get('/assessment/questions')

export const createAssessmentQuestion = (data: { pertanyaan: string; parent_id?: string | number | null }) =>
  api.post('/assessment/questions', data)

export const updateAssessmentQuestion = (id: string | number, data: { pertanyaan: string; parent_id?: string | number | null }) =>
  api.put(`/assessment/questions/${id}`, data)

export const deleteAssessmentQuestion = (id: string) =>
  api.delete(`/assessment/questions/${id}`)

export const getAkunTimPenilai = () => api.get('/auth/tim-penilai')

export const assignPenilai = (id: string | number, penilaiIds: (string | number)[]) => {
  return api.patch(`/inovasi/${id}/assign`, { penilai_ids: penilaiIds });
}

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
}) => api.get('/inovasi', { params: { ...params, status: 'SELESAI_EVALUASI' } })

export const simpanTandaTangan = async (id: string, data: { 
  usulan_inovasi_id: number; 
  user_id: number; 
  jabatan: string; 
  nip: string; 
  signature_data: string;
}) => api.patch(`/inovasi/${id}/sign`, data) // Ubah ke patch dan /sign