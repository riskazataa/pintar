import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getMyProfile, logout, updateMyProfile, type ProfileData } from '../services/auth.service'
import { useNotifications } from '../components/NotificationProvider'

const roleLabels: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  REVIEWER: 'Reviewer',
  UNIT: 'Unit',
}

export default function Profile() {
  const navigate = useNavigate()
  const { notify } = useNotifications()
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true
    if (!localStorage.getItem('token')) {
      navigate('/login', { replace: true })
      return () => { active = false }
    }
    getMyProfile()
      .then(({ data }) => {
        if (!active) return
        setProfile(data)
        setName(data.nama_lengkap)
        setEmail(data.email)
        setPhone(data.no_hp || '')
        let storedUser = {}
        try { storedUser = JSON.parse(localStorage.getItem('user') || '{}') } catch { /* Local profile cache can be refreshed from the API. */ }
        localStorage.setItem('user', JSON.stringify({ ...storedUser, ...data }))
        window.dispatchEvent(new Event('profile-updated'))
      })
      .catch((err: unknown) => {
        if (!active) return
        setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat profil.' : 'Gagal memuat profil.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [navigate])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (newPassword && newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak sama.')
      return
    }
    if (!newPassword && (currentPassword || confirmPassword)) {
      setError('Isi password baru dan konfirmasinya, atau kosongkan semua field password.')
      return
    }

    setSaving(true)
    try {
      const { data } = await updateMyProfile({
        nama_lengkap: name.trim(),
        email: email.trim(),
        no_hp: phone.trim(),
        ...(newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
      })
      setProfile(data)
      setName(data.nama_lengkap)
      setEmail(data.email)
      setPhone(data.no_hp || '')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      let storedUser = {}
      try { storedUser = JSON.parse(localStorage.getItem('user') || '{}') } catch { /* Replace an invalid cache with the saved profile. */ }
      localStorage.setItem('user', JSON.stringify({ ...storedUser, ...data }))
      window.dispatchEvent(new Event('profile-updated'))
      setSuccess('Profil berhasil diperbarui.')
      notify('Profil berhasil diperbarui.', 'success')
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan perubahan profil.' : 'Gagal menyimpan perubahan profil.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm">Memuat profil...</div>

  const dashboardByRole: Record<string, string> = {
    SUPER_ADMIN: '/admin/dashboard',
    UNIT: '/satker/dashboard',
    REVIEWER: '/tim-penilai/dashboard',
  }
  const dashboardPath = profile ? dashboardByRole[profile.role] : undefined

  return <div className="mx-auto max-w-4xl space-y-6">
    <header>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Pengaturan akun</p>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Profil Saya</h1>
          <p className="mt-2 text-sm text-gray-500">Perbarui informasi pribadi dan keamanan akun Anda.</p>
        </div>
        {dashboardPath
          ? <button type="button" onClick={() => navigate(dashboardPath)} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Kembali ke dashboard</button>
          : <button type="button" onClick={logout} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Keluar</button>}
      </div>
    </header>

    {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
    {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.5 20.1a7.5 7.5 0 0115 0A17.9 17.9 0 0112 21.75c-2.67 0-5.2-.58-7.5-1.65z" /></svg>
          </div>
          <div><h2 className="font-semibold text-gray-900">Informasi pribadi</h2><p className="text-sm text-gray-500">Informasi ini digunakan pada akun dan dokumen penilaian.</p></div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">Nama lengkap
            <input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-gray-300 px-3.5 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="name" />
          </label>
          <label className="block text-sm font-medium text-gray-700">Email
            <input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-gray-300 px-3.5 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="email" />
          </label>
          <label className="block text-sm font-medium text-gray-700">Nomor HP
            <input type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} placeholder="Contoh: 081234567890" className="mt-2 h-11 w-full rounded-xl border border-gray-300 px-3.5 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="tel" />
          </label>
          <label className="block text-sm font-medium text-gray-700">Role akun
            <input readOnly value={roleLabels[profile?.role || ''] || profile?.role || '—'} className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 font-normal text-gray-500" />
          </label>
          {profile?.satker && <label className="block text-sm font-medium text-gray-700 sm:col-span-2">Satuan kerja
            <input readOnly value={profile.satker.nama_satker} className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 font-normal text-gray-500" />
          </label>}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex items-center gap-3 border-b border-gray-100 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 00-9 0v3.75m-.75 0h10.5c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125H6.75c-.621 0-1.125-.504-1.125-1.125v-8.25c0-.621.504-1.125 1.125-1.125z" /></svg>
          </div>
          <div><h2 className="font-semibold text-gray-900">Keamanan akun</h2><p className="text-sm text-gray-500">Kosongkan bagian ini jika tidak ingin mengganti password.</p></div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-medium text-gray-700">Password saat ini
            <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-gray-300 px-3.5 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="current-password" />
          </label>
          <div className="hidden sm:block" />
          <label className="block text-sm font-medium text-gray-700">Password baru
            <input type="password" minLength={6} maxLength={100} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-gray-300 px-3.5 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="new-password" />
            <span className="mt-1 block text-xs font-normal text-gray-400">Minimal 6 karakter.</span>
          </label>
          <label className="block text-sm font-medium text-gray-700">Konfirmasi password baru
            <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-gray-300 px-3.5 font-normal outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100" autoComplete="new-password" />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? 'Menyimpan...' : 'Simpan perubahan'}
        </button>
      </div>
    </form>
  </div>
}
