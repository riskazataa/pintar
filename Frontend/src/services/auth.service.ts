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
  console.log("Isi respons backend:", data);
  localStorage.setItem('token', data.access_token)
  if (data.user) {
    localStorage.setItem('user', JSON.stringify(data.user))
  }
  return data
}

export const logout = () => {
  localStorage.removeItem('token')
  window.location.href = '/login'
}
