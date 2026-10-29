import { type FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { register as registerUser } from '../services/auth.service'
import { getSatker } from '../services/satker.service'

interface Satker {
  id: string
  nama_satker: string // Pastikan ini tetap nama_satker sesuai perbaikan sebelumnya
}

// 1. PERBAIKAN: Ubah value menjadi HURUF KAPITAL semua agar diterima backend
const roleOptions = [
  { value: '', label: 'Pilih Role' },
  { value: 'SATKER', label: 'Satker' },
  { value: 'TIM_PENILAI_MARVEL', label: 'Tim Penilai Marvel' },
  { value: 'TIM_PENILAI_ITJEN', label: 'Tim Penilai Itjen' },
]

export default function Register() {
  const navigate = useNavigate()
  const [daftarSatker, setDaftarSatker] = useState<Satker[]>([])
  const [form, setForm] = useState({
    nama_lengkap: '',
    email: '',
    password: '',
    role: '',
    satker_id: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getSatker()
      .then(({ data }) => {
        setDaftarSatker(Array.isArray(data) ? data : data.data ?? [])
      })
      .catch(() => {})
  }, [])

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
      // 2. PERBAIKAN: Sesuaikan pengecekan dengan huruf kapital
      ...(field === 'role' && value !== 'SATKER' ? { satker_id: '' } : {}),
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload: { nama_lengkap: string; email: string; password: string; role: string; satker_id?: string | number } = { ...form }
      
      // 3. PERBAIKAN: Sesuaikan pengecekan dengan huruf kapital
      if (payload.role !== 'SATKER') {
        delete payload.satker_id
      }
      else if (payload.satker_id) {
        payload.satker_id = Number(payload.satker_id) 
      }
      
      await registerUser(payload as any)
      navigate('/login')
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
            <h1 className="text-2xl font-bold text-gray-900">Daftar Akun</h1>
            <p className="mt-2 text-sm text-gray-500">
              Isi data diri Anda untuk mendaftar
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="nama_lengkap" className="block text-sm font-medium text-gray-700">
                Nama Lengkap
              </label>
              <input
                id="nama_lengkap"
                type="text"
                required
                value={form.nama_lengkap}
                onChange={(e) => handleChange('nama_lengkap', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Nama lengkap Anda"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
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
                value={form.password}
                onChange={(e) => handleChange('password', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                placeholder="Minimal 8 karakter"
              />
            </div>

            <div>
              <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                Role
              </label>
              <select
                id="role"
                required
                value={form.role}
                onChange={(e) => handleChange('role', e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              >
                {roleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`grid transition-all duration-300 ease-in-out ${
                // 4. PERBAIKAN: Sesuaikan animasi munculnya dropdown satker dengan huruf kapital
                form.role === 'SATKER'
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="pt-1">
                  <label htmlFor="satker_id" className="block text-sm font-medium text-gray-700">
                    Pilih Satker
                  </label>
                  <select
                    id="satker_id"
                    required={form.role === 'SATKER'}
                    value={form.satker_id}
                    onChange={(e) => handleChange('satker_id', e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Pilih Satker</option>
                    {daftarSatker.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nama_satker}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Memproses...' : 'Daftar'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500">
            Sudah punya akun?{' '}
            <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
              Masuk
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}