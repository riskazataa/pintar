import axios from 'axios'

const localApiBase = 'http://127.0.0.1:3000'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || localApiBase,
  headers: { 'Content-Type': 'application/json' },
})

let redirectingToLogin = false

function getResponseMessage(data: unknown) {
  if (!data || typeof data !== 'object' || !('message' in data)) return ''
  const message = (data as { message?: unknown }).message
  return Array.isArray(message) ? message.join(' ') : String(message ?? '')
}

function isPublicAuthRequest(url = '') {
  return /\/auth\/(login|forgot-password|reset-password)(?:\?|$)/i.test(url)
}

function clearExpiredSession() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  if (redirectingToLogin || window.location.pathname === '/login') return
  redirectingToLogin = true
  window.location.replace('/login?reason=session-expired')
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      const requestUrl = error.config?.url ?? ''
      const message = getResponseMessage(error.response.data)
      const isInvalidSessionToken = /token\s+(tidak valid|tidak ditemukan)|invalid token|jwt expired|token expired/i.test(message)
      const hasSession = Boolean(localStorage.getItem('token') || localStorage.getItem('user'))

      if (hasSession && !isPublicAuthRequest(requestUrl) && isInvalidSessionToken) {
        clearExpiredSession()
      }
    }
    return Promise.reject(error)
  },
)

export default api
