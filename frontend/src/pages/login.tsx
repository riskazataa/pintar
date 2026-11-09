import { type FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { login as loginUser } from '../services/auth.service'

export default function Login({ onSwitch }: { onSwitch: () => void }) {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      } else if (user?.role === 'UNIT' || user?.role === 'satker') {
        navigate('/satker/dashboard')
      } else if (user?.role === 'REVIEWER') { // <-- TAMBAHAN UNTUK TIM PENILAI
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
    <div className="w-full">
      <div className="mx-auto w-full max-w-lg">
        <div className="bg-white px-6 py-5 sm:px-8 sm:py-6">
          <div className="mb-5 text-center">
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

          <form onSubmit={handleSubmit} className="space-y-3">
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
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="contoh@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                Kata Sandi
              </label>
              <div className="relative mt-1">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-12 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Masukkan kata sandi"
                />
                <button type="button" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-blue-600 focus-visible:outline-none focus-visible:text-blue-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">{showPassword ? <><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8"/><path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7a11.8 11.8 0 01-3.1 4.2M6.2 6.2A12.4 12.4 0 002.5 12c1 2.5 4.5 7 9.5 7 1.3 0 2.5-.3 3.6-.8"/></> : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></>}</svg>
                </button>
              </div>
              <div className="mt-2 text-right">
                <Link to="/lupa-password" className="text-sm font-semibold text-blue-700 hover:underline">
                  Lupa kata sandi?
                </Link>
              </div>
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
            <button type="button" onClick={onSwitch} className="font-semibold text-violet-600 hover:text-violet-700">
              Daftar
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
