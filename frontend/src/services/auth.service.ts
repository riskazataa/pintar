import api from '../api/axios'

interface RegisterPayload {
  nama_lengkap: string
  email: string
  password: string
  role: string
  satker_id?: string
}

export const register = (payload: RegisterPayload) =>
  api.post('/auth/register', payload)

export const login = async (email: string, password: string) => {
  const { data } = await api.post('/auth/login', { email, password })
  localStorage.setItem('token', data.access_token)
  if (data.user) {
    localStorage.setItem('user', JSON.stringify(data.user))
  }
  return data
}

export interface ProfileData {
  id: number
  nama_lengkap: string
  email: string
  no_hp: string | null
  role: string
  status_registrasi: string
  satker_id: number | null
  satker: { id: number; nama_satker: string } | null
}

export const getMyProfile = () => api.get<ProfileData>('/auth/profile')

export const updateMyProfile = (data: {
  nama_lengkap: string
  email: string
  no_hp: string
  current_password?: string
  new_password?: string
}) => api.patch<ProfileData>('/auth/profile', data)

export const logout = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.location.href = '/'
}
