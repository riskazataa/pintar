import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { login as loginUser } from '../services/auth.service'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await loginUser(email, password)
      
      // Mengambil data user yang baru saja disimpan oleh auth.service
      const userStr = localStorage.getItem('user')
      const user = userStr ? JSON.parse(userStr) : null

      // Pengecekan Role untuk menentukan arah Dashboard
      if (user?.role === 'SUPER_ADMIN') {
        navigate('/admin/dashboard')
      } else if (user?.role === 'SATKER' || user?.role === 'satker') {
        navigate('/satker/dashboard')
      } else if (['TIM_PENILAI_MARVEL', 'TIM_PENILAI_ITJEN'].includes(user?.role)) { // <-- TAMBAHAN UNTUK TIM PENILAI
        navigate('/tim-penilai/dashboard')
      } else {
        navigate('/') // Fallback jika role lain
      }

    } catch (err: unknown) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.message
          ? err.response.data.message
          : 'Terjadi kesalahan. Silakan coba lagi.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white px-8 py-10 shadow-xl">
          <div className="mb-8 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Masuk</h1>
            <p className="mt-2 text-sm text-gray-500">
              Silakan masuk ke akun Anda
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="contoh@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Kata Sandi
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Masukkan kata sandi"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Belum punya akun?{' '}
            <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
              Daftar
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}