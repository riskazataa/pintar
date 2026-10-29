import { useEffect, useState } from 'react'
import axios from 'axios'
import { getUsersByStatus, getStats, verifyUser, deleteUser } from '../../services/admin.service'

interface User {
  id: string
  nama_lengkap: string
  email: string
  role: string
  satker?: {
    nama_satker: string;}
  status: string
}

interface Stats {
  active: number
  waiting: number
  approved: number
}

export default function Akun() {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<Stats>({ active: 0, waiting: 0, approved: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Waiting list modal
  const [waitingOpen, setWaitingOpen] = useState(false)
  const [waitingList, setWaitingList] = useState<User[]>([])
  const [waitingLoading, setWaitingLoading] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [usersRes, statsRes] = await Promise.all([
          getUsersByStatus('ACTIVE'),
          getStats(),
        ])
        if (cancelled) return
        setUsers(Array.isArray(usersRes.data) ? usersRes.data : usersRes.data.data ?? [])
        setStats(statsRes.data)
      } catch (err: unknown) {
        if (cancelled) return
        setError(
          axios.isAxiosError(err)
            ? err.response?.data?.message || 'Gagal memuat data'
            : 'Terjadi kesalahan',
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [refreshKey])

  const openWaitingList = async () => {
    setWaitingOpen(true)
    setWaitingLoading(true)
    try {
      const { data } = await getUsersByStatus('WAITING')
      setWaitingList(Array.isArray(data) ? data : data.data ?? [])
    } catch {
      setWaitingList([])
    } finally {
      setWaitingLoading(false)
    }
  }

  const handleVerify = async (userId: string, status: 'APPROVED' | 'REJECTED') => {
    setProcessingId(userId)
    try {
      await verifyUser(userId, status)
      setWaitingList((prev) => prev.filter((u) => u.id !== userId))
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message || 'Gagal memproses'
        : 'Terjadi kesalahan'
      alert(msg)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDelete = async (userId: string) => {
    if (!window.confirm('Yakin ingin menghapus akun ini?')) return
    try {
      await deleteUser(userId)
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.message || 'Gagal menghapus'
        : 'Terjadi kesalahan'
      alert(msg)
    }
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-800">Akun</h1>

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Akun Aktif</p>
          <p className="mt-1 text-3xl font-bold text-blue-600">{stats.active}</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Waiting List</p>
          <p className="mt-1 text-3xl font-bold text-amber-500">{stats.waiting}</p>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Approval</p>
          <p className="mt-1 text-3xl font-bold text-emerald-600">{stats.approved}</p>
        </div>
      </div>

      {/* Waiting List Button */}
      <div className="mb-4 flex items-center justify-end">
        <button
          onClick={openWaitingList}
          className="relative flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          Waiting List
          {stats.waiting > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {stats.waiting}
            </span>
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Users Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <th className="px-6 py-3">No</th>
                <th className="px-6 py-3">Nama</th>
                <th className="px-6 py-3">Satker</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Role</th>
                <th className="px-6 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                    Memuat data...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                    Belum ada akun aktif
                  </td>
                </tr>
              ) : (
                users.map((u, i) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-gray-500">{i + 1}</td>
                    <td className="px-6 py-4 font-medium text-gray-800">{u.nama_lengkap}</td>
                    <td className="px-6 py-4 text-gray-600">
                     {u.satker?.nama_satker || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {u.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                        title="Hapus"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Waiting List Modal */}
      {waitingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">Waiting List</h2>
              <button
                onClick={() => setWaitingOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {waitingLoading ? (
              <p className="py-8 text-center text-sm text-gray-400">Memuat...</p>
            ) : waitingList.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">Tidak ada akun yang menunggu</p>
            ) : (
              <div className="space-y-3">
                {waitingList.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{u.nama_lengkap}</p>
                      <p className="text-sm text-gray-500">{u.email}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleVerify(u.id, 'APPROVED')}
                        disabled={processingId === u.id}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {processingId === u.id ? '...' : 'Setujui'}
                      </button>
                      <button
                        onClick={() => handleVerify(u.id, 'REJECTED')}
                        disabled={processingId === u.id}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                      >
                        {processingId === u.id ? '...' : 'Tolak'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
