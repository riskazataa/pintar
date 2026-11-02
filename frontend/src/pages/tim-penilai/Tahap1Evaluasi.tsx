import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getUsulanList } from '../../services/inovasi.service'
import { getSatker } from '../../services/satker.service'
import { getStatusPresentation } from '../../utils/inovasi-status'
import TablePagination from '../../components/TablePagination'
import TableToolbar, { type TableSortOrder } from '../../components/TableToolbar'

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
  penilai?: { id: string | number }[]
  penilai_tahap2?: { id: string | number }[]
  hasil_penilaian?: string | null
  hasil_penilaian_tahap1?: string | null
  hasil_penilaian_tahap2?: string | null
  usulan_signatures?: { user_id: string | number; tahap: number; keputusan?: string | null }[]
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number
}

interface SatkerOption { id: string | number; nama_satker: string }

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return dateStr }
}

export default function Tahap1Evaluasi({ tahap = 1 }: { tahap?: number }) {
  const navigate = useNavigate()

  const [data, setData] = useState<UsulanItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [satkerFilter, setSatkerFilter] = useState('')
  const [satkerOptions, setSatkerOptions] = useState<SatkerOption[]>([])
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<TableSortOrder>('desc')

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsulanList({
        page, limit,
        search: search || undefined,
        hasil: statusFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        satker_id: satkerFilter || undefined,
        assignedToMe: true,
        tahap,
        sort_order: sortOrder,
      })
      const body = res.data
      const list: UsulanItem[] = Array.isArray(body) ? body : body.data ?? []
      setData(statusFilter ? list : list.filter((item) => item.status !== 'SELESAI_EVALUASI'))
      setMeta(body.meta ? { ...body.meta, totalPages: body.meta.total_pages ?? body.meta.totalPages } : body.pagination ?? { page, limit, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat data' : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter, startDate, endDate, satkerFilter, tahap, sortOrder])

  useEffect(() => { fetchList() }, [fetchList])

  useEffect(() => {
    getSatker()
      .then((response) => setSatkerOptions(Array.isArray(response.data) ? response.data : response.data?.data ?? []))
      .catch(() => setSatkerOptions([]))
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Evaluasi Data Usulan</h2>
          <p className="text-sm text-gray-500">Penilaian Tahap {tahap} — Usulan yang ditugaskan ke anda</p>
        </div>
        <button onClick={fetchList} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh Data
        </button>
      </div>

      <TableToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1) }} searchPlaceholder="Cari inovasi / PIC..." sortOrder={sortOrder} onSortOrderChange={(value) => { setSortOrder(value); setPage(1) }}>
        <label className="block text-xs font-medium text-slate-500">Status
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
            <option value="">Semua Status</option>
            <option value="SEDANG_DIREVIEW">Sedang Direview</option>
            <option value="MENUNGGU_TTD">Menunggu Tanda Tangan</option>
            <option value="LOLOS">Lolos</option>
            <option value="TIDAK_LOLOS">Tidak Lolos</option>
            <option value="PERBAIKAN">Perlu Perbaikan</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500">Dari tanggal
          <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="block text-xs font-medium text-slate-500">Sampai tanggal
          <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="block text-xs font-medium text-slate-500">Unit
          <select value={satkerFilter} onChange={(event) => { setSatkerFilter(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
            <option value="">Semua Unit</option>
            {satkerOptions.map((satker) => <option key={satker.id} value={satker.id}>{satker.nama_satker}</option>)}
          </select>
        </label>
      </TableToolbar>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="border-b px-4 py-4 sm:px-6">Tanggal Masuk</th>
                <th className="border-b px-4 py-4 sm:px-6">Unit</th>
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
                      {(() => { const status = getStatusPresentation(item, tahap); return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span> })()}
                    </td>
                   <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
  <button
    onClick={() => navigate(`/tim-penilai/tahap-${tahap}/evaluasi/${item.id}`)}
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
        <TablePagination meta={meta} onPage={setPage} onLimitChange={(size) => { setLimit(size); setPage(1) }} />
      </div>
    </div>
  )
}
