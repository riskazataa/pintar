import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getSatkerSubmissionSummary, getUsulanList, type SatkerSubmissionSummary } from '../../services/inovasi.service'
import { getSatker } from '../../services/satker.service'
import { getStatusPresentation } from '../../utils/inovasi-status'
import TablePagination from '../../components/TablePagination'
import TableToolbar, { type TableSortOrder } from '../../components/TableToolbar'
import YearSelect from '../../components/YearSelect'

// ─── Types ───────────────────────────────────────────
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
  hasil_penilaian_tahap2?: string | null
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'SEDANG_DIREVIEW', label: 'Sedang Direview' },
  { value: 'MENUNGGU_TTD', label: 'Menunggu Tanda Tangan' },
  { value: 'LOLOS', label: 'Lolos' },
  { value: 'TIDAK_LOLOS', label: 'Tidak Lolos' },
  { value: 'PERBAIKAN', label: 'Perlu Perbaikan' },
]

interface SatkerOption { id: string | number; nama_satker: string }

// ─── Helpers ─────────────────────────────────────────
function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return dateStr }
}

export default function Tahap1Usulan({ tahap = 1 }: { tahap?: number }) {
  const navigate = useNavigate()

  const [data, setData] = useState<UsulanItem[]>([])
  const [satkerSummary, setSatkerSummary] = useState<SatkerSubmissionSummary[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [satkerFilter, setSatkerFilter] = useState('')
  const [satkerOptions, setSatkerOptions] = useState<SatkerOption[]>([])
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<TableSortOrder>('desc')
  const [selectedYear, setSelectedYear] = useState(() => String(new Date().getFullYear()))

  const fetchList = useCallback(async () => {
    if (!selectedYear) {
      setData([])
      setMeta({ page: 1, limit, total: 0, totalPages: 0 })
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await getUsulanList({
        tahap, page, limit, tahun: Number(selectedYear), search: search || undefined,
        hasil: statusFilter || undefined,
        startDate: startDate || undefined, endDate: endDate || undefined,
        satker_id: satkerFilter || undefined,
        sort_order: sortOrder,
      })
      const body = res.data
      const list: UsulanItem[] = Array.isArray(body) ? body : body.data ?? []
      setData(list)
      setMeta(body.meta ? { ...body.meta, totalPages: body.meta.total_pages ?? body.meta.totalPages } : body.pagination ?? { page, limit, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat data' : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter, startDate, endDate, satkerFilter, tahap, sortOrder, selectedYear])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  useEffect(() => {
    if (!selectedYear) {
      setSatkerSummary([])
      return
    }
    let cancelled = false
    setSummaryLoading(true)
    setSummaryError('')
    getSatkerSubmissionSummary(Number(selectedYear), tahap)
      .then((response) => {
        if (!cancelled) setSatkerSummary(Array.isArray(response.data) ? response.data : [])
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setSatkerSummary([])
        setSummaryError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat rekap satker' : 'Gagal memuat rekap satker')
      })
      .finally(() => { if (!cancelled) setSummaryLoading(false) })
    return () => { cancelled = true }
  }, [selectedYear, tahap])

  useEffect(() => {
    if (!summaryOpen) return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSummaryOpen(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [summaryOpen])

  useEffect(() => {
    getSatker()
      .then((response) => setSatkerOptions(Array.isArray(response.data) ? response.data : response.data?.data ?? []))
      .catch(() => setSatkerOptions([]))
  }, [])

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
    setSatkerFilter('')
    setSortOrder('desc')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Penilaian Inovasi</h2>
          <p className="text-sm text-gray-500">Buka inovasi untuk melihat tahapan, penugasan, evaluasi, dan hasil</p>
        </div>
        <button onClick={clearFilters} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3L4 5Z" /><path strokeLinecap="round" strokeLinejoin="round" d="m17 16 4 4m0-4-4 4" /></svg>
          Hapus filter
        </button>
      </div>

      <YearSelect value={selectedYear} placeholder="Pilih tahun" onChange={(year) => { setData([]); setLoading(Boolean(year)); setSelectedYear(year); setPage(1) }} />

      {selectedYear ? <>
      <TableToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1) }} searchPlaceholder="Cari inovasi, unit, PIC, atau tahun..." sortOrder={sortOrder} onSortOrderChange={(value) => { setSortOrder(value); setPage(1) }} actions={
        <button type="button" onClick={() => setSummaryOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md bg-gradient-to-r from-teal-600 to-cyan-600 px-3 text-sm font-semibold text-white shadow-sm shadow-teal-200 transition hover:from-teal-700 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2">
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5V14m5 5.5V9m5 10.5V4m5 15.5v-8" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 20.5h19" /></svg>
          Rekap Satker
        </button>
      }>
        <label className="block text-xs font-medium text-slate-500">Status
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500">Dari tanggal
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="block text-xs font-medium text-slate-500">Sampai tanggal
          <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="block text-xs font-medium text-slate-500">Unit
          <select value={satkerFilter} onChange={(e) => { setSatkerFilter(e.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
            <option value="">Semua Unit</option>
            {satkerOptions.map((satker) => <option key={satker.id} value={satker.id}>{satker.nama_satker}</option>)}
          </select>
        </label>
      </TableToolbar>

      {summaryOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setSummaryOpen(false) }}>
        <section role="dialog" aria-modal="true" aria-labelledby="satker-summary-title" className="my-auto flex max-h-[min(92dvh,780px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl shadow-slate-950/30">
          <header className="relative shrink-0 overflow-hidden bg-gradient-to-r from-teal-700 via-emerald-600 to-cyan-600 px-5 py-5 text-white sm:px-7">
            <div aria-hidden="true" className="absolute -right-8 -top-16 h-48 w-48 rounded-full bg-white/10" />
            <div className="relative flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                  <svg aria-hidden="true" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5V14m5 5.5V9m5 10.5V4m5 15.5v-8" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 20.5h19" /></svg>
                </span>
                <div>
                  <h2 id="satker-summary-title" className="text-lg font-semibold sm:text-xl">Rekap Usulan per Satker</h2>
                  <p className="mt-1 text-sm text-teal-50">Tahun pengajuan {selectedYear}{tahap === 2 ? ' · Penilaian Tahap 2' : ' · Seleksi Awal'}</p>
                </div>
              </div>
              <button type="button" aria-label="Tutup rekap" onClick={() => setSummaryOpen(false)} className="rounded-lg p-2 text-white/80 transition hover:bg-white/15 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70">
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
              </button>
            </div>
          </header>

          {summaryError ? <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{summaryError}</div> : summaryLoading ? (
            <div className="px-6 py-14 text-center text-sm text-slate-500">Memuat rekap satker...</div>
          ) : satkerSummary.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-slate-500">Belum ada usulan yang masuk pada tahun ini.</div>
          ) : <>
            <div className="grid shrink-0 gap-3 border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-4 sm:grid-cols-3 sm:px-7">
              <div className="flex items-center gap-3 rounded-xl border border-teal-100 bg-teal-50 p-3.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">{satkerSummary.length}</span>
                <div><div className="text-xs font-medium uppercase tracking-wide text-teal-800">Satker mengusulkan</div><div className="mt-0.5 text-sm text-teal-700">unit aktif</div></div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">{satkerSummary.reduce((total, satker) => total + satker.jumlah_usulan, 0)}</span>
                <div><div className="text-xs font-medium uppercase tracking-wide text-blue-800">Total inovasi</div><div className="mt-0.5 text-sm text-blue-700">usulan masuk</div></div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 p-3.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-sm font-bold text-white">{satkerSummary.reduce((total, satker) => total + satker.jumlah_perlu_perbaikan, 0)}</span>
                <div><div className="text-xs font-medium uppercase tracking-wide text-amber-800">Perlu perbaikan</div><div className="mt-0.5 text-sm text-amber-700">usulan dikembalikan</div></div>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th className="w-16 px-5 py-3.5 text-center sm:px-7">No</th><th className="px-5 py-3.5">Satker</th><th className="px-5 py-3.5 text-center">Jumlah inovasi</th><th className="px-5 py-3.5 text-center">Perlu perbaikan</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {satkerSummary.map((satker, index) => (
                    <tr key={satker.satker_id} className="transition-colors hover:bg-teal-50/50">
                      <td className="px-5 py-3.5 text-center font-medium tabular-nums text-slate-500 sm:px-7">{index + 1}</td>
                      <td className="px-5 py-3.5 font-medium text-slate-800 sm:px-7">{satker.nama_satker}</td>
                      <td className="px-5 py-3.5 text-center tabular-nums"><span className="inline-flex min-w-9 justify-center rounded-full bg-blue-50 px-2.5 py-1 font-semibold text-blue-700">{satker.jumlah_usulan}</span></td>
                      <td className="px-5 py-3.5 text-center tabular-nums"><span className={`inline-flex min-w-9 justify-center rounded-full px-2.5 py-1 font-semibold ${satker.jumlah_perlu_perbaikan > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{satker.jumlah_perlu_perbaikan}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex shrink-0 justify-end border-t border-slate-100 bg-slate-50/80 px-5 py-3.5 sm:px-7">
              <button type="button" onClick={() => setSummaryOpen(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100">Tutup</button>
            </footer>
          </>}
        </section>
      </div>}

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="w-14 border-b px-3 py-4 text-center sm:px-4">No</th>
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
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">
                    <svg className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Memuat data usulan...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">Belum ada usulan inovasi yang masuk</td></tr>
              ) : (
                data.map((item, index) => {
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-blue-50/50">
                      <td className="px-3 py-3.5 text-center tabular-nums text-gray-500 sm:px-4">{(page - 1) * limit + index + 1}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{formatDate(item.createdAt || item.created_at || item.tanggal_masuk)}</td>
                      <td className="px-4 py-3.5 text-gray-600 sm:px-6 font-medium text-blue-900">{item.nama_satker || item.satker?.nama_satker || item.user?.satker?.nama_satker || '-'}</td>
                      <td className="px-4 py-3.5 font-medium text-slate-800 sm:px-6">{item.judul || item.nama_inovasi}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{item.pic_nama || item.penanggung_jawab || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 sm:px-6">
                        {(() => { const status = getStatusPresentation(item, tahap); const stageLabel = tahap === 1 ? 'Seleksi Awal' : 'Penilaian Akhir'; const label = status.label === 'Lolos' || status.label === 'Tidak Lolos' ? `${status.label} ${stageLabel}` : status.label; return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{label}</span> })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
                        <div className="inline-flex items-center gap-1.5">
                          {/* TOMBOL DETAIL (Ukuran Kecil h-4 w-4) */}
                          <button onClick={() => navigate(`/tim-penilai/usulan/${item.id}`)} className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" title="Cek Detail">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </button>

                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <TablePagination meta={meta} onPage={setPage} onLimitChange={(size) => { setLimit(size); setPage(1) }} />
      </div>
      </> : <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">Pilih tahun pengajuan untuk menampilkan usulan inovasi reviewer.</div>}

    </div>
  )
}
