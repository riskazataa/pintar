import { type FormEvent, useEffect, useState } from 'react'
import axios from 'axios'
import { register as registerUser } from '../services/auth.service'
import { getSatker } from '../services/satker.service'

interface Unit {
  id: string
  nama_satker: string // Pastikan ini tetap nama_satker sesuai perbaikan sebelumnya
}

// 1. PERBAIKAN: Ubah value menjadi HURUF KAPITAL semua agar diterima backend
const roleOptions = [
  { value: '', label: 'Pilih Role' },
  { value: 'UNIT', label: 'Unit' },
  { value: 'REVIEWER', label: 'Reviewer' },
]

export default function Register({ onSwitch, onRegistered }: { onSwitch: () => void; onRegistered: () => void }) {
  const [daftarSatker, setDaftarSatker] = useState<Unit[]>([])
  const [form, setForm] = useState({
    nama_lengkap: '',
    email: '',
    password: '',
    role: '',
    satker_id: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      ...(field === 'role' && value !== 'UNIT' ? { satker_id: '' } : {}),
    }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload: { nama_lengkap: string; email: string; password: string; role: string; satker_id?: string | number } = { ...form }
      
      // 3. PERBAIKAN: Sesuaikan pengecekan dengan huruf kapital
      if (payload.role !== 'UNIT') {
        delete payload.satker_id
      }
      else if (payload.satker_id) {
        payload.satker_id = Number(payload.satker_id) 
      }
      
      await registerUser(payload as any)
      onRegistered()
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

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-5 gap-y-3 sm:grid-cols-2">
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
                className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
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
              <div className="relative mt-1">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={(e) => handleChange('password', e.target.value)}
                  className="block w-full rounded-lg border border-gray-300 px-4 py-2.5 pr-12 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Minimal 8 karakter"
                />
                <button type="button" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-400 hover:text-blue-600 focus-visible:outline-none focus-visible:text-blue-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">{showPassword ? <><path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8"/><path strokeLinecap="round" strokeLinejoin="round" d="M9.9 5.2A10.8 10.8 0 0112 5c5 0 8.5 4.5 9.5 7a11.8 11.8 0 01-3.1 4.2M6.2 6.2A12.4 12.4 0 002.5 12c1 2.5 4.5 7 9.5 7 1.3 0 2.5-.3 3.6-.8"/></> : <><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></>}</svg>
                </button>
              </div>
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
              className={`grid transition-all duration-300 ease-in-out sm:col-span-2 ${
                // 4. PERBAIKAN: Sesuaikan animasi munculnya dropdown satker dengan huruf kapital
                form.role === 'UNIT'
                  ? 'grid-rows-[1fr] opacity-100'
                  : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="pt-1">
                  <label htmlFor="satker_id" className="block text-sm font-medium text-gray-700">
                    Pilih Unit
                  </label>
                  <select
                    id="satker_id"
                    required={form.role === 'UNIT'}
                    value={form.satker_id}
                    onChange={(e) => handleChange('satker_id', e.target.value)}
                    className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="">Pilih Unit</option>
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
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2"
            >
              {loading ? 'Memproses...' : 'Daftar'}
            </button>
          </form>

          <p className="mt-3 text-center text-sm text-gray-500 sm:col-span-2">
            Sudah punya akun?{' '}
            <button type="button" onClick={onSwitch} className="font-semibold text-violet-600 hover:text-violet-700">
              Masuk
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
