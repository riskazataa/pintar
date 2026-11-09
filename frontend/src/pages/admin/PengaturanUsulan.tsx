import { useEffect, useState } from 'react'
import axios from 'axios'
import { useNotifications } from '../../components/NotificationProvider'
import { getSubmissionLock, setSubmissionLock } from '../../services/submission-settings.service'

export default function PengaturanUsulan() {
  const { notify } = useNotifications()
  const [locked, setLocked] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    getSubmissionLock()
      .then(({ data }) => {
        if (!cancelled) setLocked(data.locked)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(axios.isAxiosError(err)
            ? err.response?.data?.message || 'Gagal memuat status kunci usulan.'
            : 'Gagal memuat status kunci usulan.')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  const handleToggle = async () => {
    if (locked === null) return
    setSaving(true)
    setError('')
    try {
      const { data } = await setSubmissionLock(!locked)
      setLocked(data.locked)
      notify(data.locked
        ? 'Penambahan usulan berhasil dikunci.'
        : 'Pengajuan usulan dibuka kembali.', 'success')
    } catch (err: unknown) {
      setError(axios.isAxiosError(err)
        ? err.response?.data?.message || 'Gagal mengubah pengaturan usulan.'
        : 'Gagal mengubah pengaturan usulan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Kunci Usulan</h1>
        <p className="mt-1 text-sm text-gray-500">Atur kapan satuan kerja dapat menambahkan usulan baru.</p>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${locked ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V7.875a4.5 4.5 0 00-9 0V10.5m-1.125 0h11.25c.621 0 1.125.504 1.125 1.125v7.5c0 .621-.504 1.125-1.125 1.125H6.375c-.621 0-1.125-.504-1.125-1.125v-7.5c0-.621.504-1.125 1.125-1.125z" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-800">Status pengajuan</h2>
                {!loading && locked !== null && (
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${locked ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                    {locked ? 'Terkunci' : 'Dibuka'}
                  </span>
                )}
              </div>
              <p className="mt-2 max-w-xl text-sm leading-6 text-gray-600">
                {loading ? 'Memuat status pengajuan…' : locked
                  ? 'Satuan kerja tidak dapat membuat usulan atau draft baru sampai pengajuan dibuka kembali.'
                  : 'Satuan kerja dapat menambahkan usulan dan menyimpannya sebagai draft.'}
              </p>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                Usulan dan draft yang sudah ada tetap dapat dibuka dan diperbarui.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggle}
            disabled={loading || saving || locked === null}
            aria-pressed={Boolean(locked)}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${locked ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}`}
          >
            {saving ? 'Menyimpan…' : loading ? 'Memuat…' : locked ? 'Buka kembali pengajuan' : 'Kunci penambahan usulan'}
          </button>
        </div>
      </section>
    </div>
  )
}
