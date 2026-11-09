import axios from 'axios'

const localApiBase = 'http://127.0.0.1:3000'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || localApiBase,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api
