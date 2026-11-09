import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import axios from 'axios'
import { requestPasswordReset, resetPassword } from '../services/auth.service'

const inputClass = 'mt-1 block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200'

export default function PasswordRecovery({ mode }: { mode: 'request' | 'reset' }) {
  const { hash } = useLocation()
  const params = new URLSearchParams(hash.slice(1))
  const userId = Number(params.get('akun'))
  const token = params.get('token') ?? ''
  const isReset = mode === 'reset'
  const validLink = Number.isInteger(userId) && userId > 0 && userId <= 2147483647 && /^[a-f0-9]{64}$/.test(token)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (isReset && password !== confirmation) {
      setError('Konfirmasi kata sandi belum cocok.')
      return
    }
    if (isReset && new TextEncoder().encode(password).length > 72) {
      setError('Kata sandi melebihi batas ukuran. Gunakan kata sandi yang lebih pendek.')
      return
    }
    setLoading(true)
    try {
      if (isReset) {
        await resetPassword(userId, token, password)
        setPassword('')
        setConfirmation('')
        setMessage('Kata sandi berhasil diubah. Silakan masuk dengan kata sandi baru.')
      } else {
        const { data } = await requestPasswordReset(email.trim())
        setMessage(data.message)
      }
    } catch (err) {
      const responseMessage = axios.isAxiosError(err) && (err.response?.status === 400 || err.response?.status === 503)
        ? err.response.data?.message
        : undefined
      if (typeof responseMessage === 'string') {
        setError(responseMessage)
      } else if (axios.isAxiosError(err) && !err.response) {
        setError('Tidak dapat terhubung ke server. Silakan coba lagi dalam beberapa saat.')
      } else {
        setError('Terjadi kesalahan. Silakan coba lagi.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <section aria-labelledby="password-recovery-title" className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <header className="text-center">
          <img src="/siapin-logo.svg" alt="SIAPIN" className="mx-auto mb-4 h-12 w-12" />
          <h1 id="password-recovery-title" className="text-2xl font-bold text-slate-900">
            {isReset ? 'Buat kata sandi baru' : 'Lupa kata sandi'}
          </h1>
          {!message && (!isReset || validLink) && (
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {isReset
                ? 'Masukkan dan konfirmasi kata sandi baru Anda.'
                : 'Masukkan email akun SIAPIN Anda untuk menerima tautan reset.'}
            </p>
          )}
        </header>
        {message ? (
          <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>
        ) : isReset && !validLink ? (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">Tautan reset tidak valid. Silakan minta tautan baru.</p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {isReset ? (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  Kata sandi baru (minimal 6 karakter)
                  <input className={inputClass} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} maxLength={72} required />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Konfirmasi kata sandi
                  <input className={inputClass} type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} maxLength={72} required />
                </label>
              </>
            ) : (
              <label className="block text-sm font-medium text-slate-700">
                Email yang terdaftar
                <input className={inputClass} type="email" autoComplete="email" placeholder="nama@email.com" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} required />
              </label>
            )}
            <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {loading ? 'Memproses...' : isReset ? 'Simpan kata sandi' : 'Kirim tautan reset'}
            </button>
          </form>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-slate-200 pt-4 text-sm font-semibold text-blue-700">
          <Link to="/login" className="hover:underline">Kembali ke login</Link>
          {isReset && !message && <Link to="/lupa-password" className="hover:underline">Minta tautan baru</Link>}
        </div>
      </section>
    </main>
  )
}
