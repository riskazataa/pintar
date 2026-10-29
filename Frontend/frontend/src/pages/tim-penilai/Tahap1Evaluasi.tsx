import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getUsulanList } from '../../services/inovasi.service'

interface UsulanItem {
  id: string
  tanggal_masuk?: string
  createdAt?: string
  created_at?: string
  nama_satker?: string
  satker?: { nama_satker: string }
  user?: { satker?: { nama_satker: string } }
  nama_inovasi?: string
  judul?: string
  penanggung_jawab?: string
  pic_nama?: string
  status: string
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
  PERBAIKAN: 'bg-blue-100 text-blue-700',
  SELESAI_EVALUASI: 'bg-emerald-100 text-emerald-700',
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return dateStr }
}

function Paginator({ meta, onPage }: { meta: PaginationMeta; onPage: (p: number) => void }) {
  if (meta.totalPages <= 1) return null
  const pages: (number | string)[] = []
  for (let i = 1; i <= meta.totalPages; i++) {
    if (i === 1 || i === meta.totalPages || (i >= meta.page - 1 && i <= meta.page + 1)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
      <p className="text-sm text-gray-500">
        Menampilkan {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} dari {meta.total}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(meta.page - 1)} disabled={meta.page <= 1} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
        {pages.map((p, i) => typeof p === 'string'
          ? <span key={`ellipsis-${i}`} className="px-2 text-sm text-gray-400">...</span>
          : <button key={p} onClick={() => onPage(p)} className={`min-w-[32px] rounded-lg px-2 py-1.5 text-sm font-medium transition ${p === meta.page ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
        )}
        <button onClick={() => onPage(meta.page + 1)} disabled={meta.page >= meta.totalPages} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  )
}

export default function Tahap1Evaluasi() {
  const navigate = useNavigate()

  const [data, setData] = useState<UsulanItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsulanList({
        page, limit: 10,
        search: search || undefined,
        status: statusFilter || undefined,
        assignedToMe: true,
      })
      const body = res.data
      const list: UsulanItem[] = Array.isArray(body) ? body : body.data ?? []
      setData(list.filter((item) => item.status !== 'SELESAI_EVALUASI'))
      setMeta(body.meta ?? body.pagination ?? { page, limit: 10, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat data' : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter])

  useEffect(() => { fetchList() }, [fetchList])

  const handleSearch = () => { setPage(1); fetchList() }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Evaluasi Data Usulan</h2>
          <p className="text-sm text-gray-500">Penilaian Tahap 1 — Usulan yang ditugaskan ke anda</p>
        </div>
        <button onClick={fetchList} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh Data
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">Cari</label>
          <div className="relative">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Cari inovasi / PIC..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <div className="w-full sm:w-40">
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
            <option value="">Semua Status</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Disetujui</option>
            <option value="REJECTED">Ditolak</option>
            <option value="PERBAIKAN">Perbaikan</option>
          </select>
        </div>
        <button onClick={handleSearch} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Cari</button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="border-b px-4 py-4 sm:px-6">Tanggal Masuk</th>
                <th className="border-b px-4 py-4 sm:px-6">Asal Satker</th>
                <th className="border-b px-4 py-4 sm:px-6">Judul Inovasi</th>
                <th className="border-b px-4 py-4 sm:px-6">PIC</th>
                <th className="border-b px-4 py-4 sm:px-6">Status</th>
                <th className="border-b px-4 py-4 text-right sm:px-6">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                    <svg className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Memuat data usulan...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">Belum ada usulan yang ditugaskan kepada anda</td></tr>
              ) : (
                data.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-blue-50/50">
                    <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{formatDate(item.createdAt || item.created_at || item.tanggal_masuk)}</td>
                    <td className="px-4 py-3.5 text-gray-600 sm:px-6 font-medium text-blue-900">{item.nama_satker || item.satker?.nama_satker || item.user?.satker?.nama_satker || '-'}</td>
                    <td className="px-4 py-3.5 text-gray-800 font-medium sm:px-6">{item.judul || item.nama_inovasi}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{item.pic_nama || item.penanggung_jawab || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 sm:px-6">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] || 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
                    </td>
                   <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
  <button
    onClick={() => navigate(`/tim-penilai/tahap-1/evaluasi/${item.id}`)}
    className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600"
    title="Nilai Data"
  >
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75" />
    </svg>
  </button>
</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Paginator meta={meta} onPage={(p) => setPage(p)} />
      </div>
    </div>
  )
}
