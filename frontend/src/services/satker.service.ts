import api from '../api/axios'

export const getSatker = () => api.get('/satker')

// PERBAIKAN: Ubah payload { nama } menjadi { nama_satker: nama }
export const createSatker = (nama: string) =>
  api.post('/satker', { nama_satker: nama })

// PERBAIKAN: Lakukan hal yang sama untuk fungsi update
export const updateSatker = (id: string, nama: string) =>
  api.patch(`/satker/${id}`, { nama_satker: nama })

export const deleteSatker = (id: string) =>
  api.delete(`/satker/${id}`)