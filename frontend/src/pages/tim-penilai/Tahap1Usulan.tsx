import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { assignPenilai, getAkunTimPenilai, getSatkerSubmissionSummary, getUsulanList, type SatkerSubmissionSummary } from '../../services/inovasi.service'
import { getSatker } from '../../services/satker.service'
import { getStatusPresentation } from '../../utils/inovasi-status'
import TablePagination from '../../components/TablePagination'
import TableToolbar, { type TableSortOrder } from '../../components/TableToolbar'
import YearSelect from '../../components/YearSelect'
import { useNotifications } from '../../components/NotificationProvider'

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
  pic_telp?: string
  pic_penanggung_jawab?: PICContact[] | null
  status: string
  hasil_penilaian_tahap2?: string | null
  penilai?: { id: string | number; nama_lengkap?: string }[]
  penilai_tahap2?: { id: string | number; nama_lengkap?: string }[]
  usulan_signatures?: { tahap: number; user_id: string | number }[]
}

interface PICContact { nama?: string; no_whatsapp?: string }
interface ReviewerOption { id: string | number; nama_lengkap: string }
type ReviewerPageMode = 'INOVASI' | 'PENILAIAN'

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

interface ReviewerListState {
  search: string
  statusFilter: string
  startDate: string
  endDate: string
  satkerFilter: string
  page: number
  limit: number
  sortOrder: TableSortOrder
  selectedYear: string
  filtersOpen: boolean
}

// ─── Helpers ─────────────────────────────────────────
function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return dateStr }
}

function getReviewerListStateKey(mode: ReviewerPageMode, tahap: number) {
  let reviewerId = 'anonymous'
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    if (user.id !== undefined && user.id !== null) reviewerId = String(user.id)
  } catch { /* Use an isolated anonymous key if local user data is malformed. */ }
  return `tim-penilai:list-state:${reviewerId}:${mode}:${tahap}`
}

function readReviewerListState(key: string): Partial<ReviewerListState> {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return {}
    const value = JSON.parse(raw) as Record<string, unknown>
    const isDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    return {
      search: typeof value.search === 'string' ? value.search : '',
      statusFilter: typeof value.statusFilter === 'string' && STATUS_OPTIONS.some((option) => option.value === value.statusFilter) ? value.statusFilter : '',
      startDate: isDate(value.startDate) ? value.startDate : '',
      endDate: isDate(value.endDate) ? value.endDate : '',
      satkerFilter: typeof value.satkerFilter === 'string' ? value.satkerFilter : '',
      page: typeof value.page === 'number' && Number.isInteger(value.page) && value.page > 0 ? value.page : 1,
      limit: typeof value.limit === 'number' && [0, 5, 10, 15].includes(value.limit) ? value.limit : 10,
      sortOrder: value.sortOrder === 'asc' ? 'asc' : 'desc',
      selectedYear: typeof value.selectedYear === 'string' && /^\d{4}$/.test(value.selectedYear) ? value.selectedYear : String(new Date().getFullYear()),
      filtersOpen: value.filtersOpen === true,
    }
  } catch {
    return {}
  }
}

export default function Tahap1Usulan({ tahap = 1, mode = 'PENILAIAN' }: { tahap?: number; mode?: ReviewerPageMode }) {
  const navigate = useNavigate()
  const { notify } = useNotifications()
  const listStateKey = getReviewerListStateKey(mode, tahap)
  const [savedListState] = useState(() => readReviewerListState(listStateKey))

  const [data, setData] = useState<UsulanItem[]>([])
  const [satkerSummary, setSatkerSummary] = useState<SatkerSubmissionSummary[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryExporting, setSummaryExporting] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [meta, setMeta] = useState<PaginationMeta>({ page: savedListState.page ?? 1, limit: savedListState.limit ?? 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState(savedListState.search ?? '')
  const [statusFilter, setStatusFilter] = useState(savedListState.statusFilter ?? '')
  const [startDate, setStartDate] = useState(savedListState.startDate ?? '')
  const [endDate, setEndDate] = useState(savedListState.endDate ?? '')
  const [satkerFilter, setSatkerFilter] = useState(savedListState.satkerFilter ?? '')
  const [satkerOptions, setSatkerOptions] = useState<SatkerOption[]>([])
  const [page, setPage] = useState(savedListState.page ?? 1)
  const [limit, setLimit] = useState(savedListState.limit ?? 10)
  const [sortOrder, setSortOrder] = useState<TableSortOrder>(savedListState.sortOrder ?? 'desc')
  const [selectedYear, setSelectedYear] = useState(savedListState.selectedYear ?? String(new Date().getFullYear()))
  const [filtersOpen, setFiltersOpen] = useState(savedListState.filtersOpen ?? false)
  const [reviewers, setReviewers] = useState<ReviewerOption[]>([])
  const [assignmentTarget, setAssignmentTarget] = useState<UsulanItem | null>(null)
  const [assignmentStage, setAssignmentStage] = useState<1 | 2>(1)
  const [selectedReviewers, setSelectedReviewers] = useState<Set<string>>(new Set())
  const [assignmentSaving, setAssignmentSaving] = useState(false)
  const [assignmentError, setAssignmentError] = useState('')

  useEffect(() => {
    try {
      const state: ReviewerListState = { search, statusFilter, startDate, endDate, satkerFilter, page, limit, sortOrder, selectedYear, filtersOpen }
      sessionStorage.setItem(listStateKey, JSON.stringify(state))
    } catch { /* Keep filtering usable if session storage is unavailable. */ }
  }, [listStateKey, search, statusFilter, startDate, endDate, satkerFilter, page, limit, sortOrder, selectedYear, filtersOpen])

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
        assignedToMeAny: mode === 'PENILAIAN' || undefined,
        sort_order: sortOrder,
      })
      const body = res.data
      const list: UsulanItem[] = Array.isArray(body) ? body : body.data ?? []
      setData(list)
      setMeta(body.meta ? { ...body.meta, totalPages: body.meta.total_pages ?? body.meta.totalPages } : body.pagination ?? { page, limit, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      const apiMessage = axios.isAxiosError(err) ? err.response?.data?.message : null
      setError(Array.isArray(apiMessage)
        ? apiMessage.join(' ')
        : typeof apiMessage === 'string'
          ? apiMessage
          : axios.isAxiosError(err)
            ? err.response ? `Gagal memuat data (HTTP ${err.response.status})` : 'Server tidak dapat dihubungi. Periksa koneksi backend.'
            : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter, startDate, endDate, satkerFilter, tahap, sortOrder, selectedYear, mode])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  useEffect(() => {
    if (mode !== 'INOVASI' || !selectedYear) {
      setSatkerSummary([])
      setSummaryLoading(false)
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
  }, [selectedYear, tahap, mode])

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

  useEffect(() => {
    if (mode !== 'INOVASI') {
      setReviewers([])
      return
    }
    getAkunTimPenilai()
      .then((response) => setReviewers(response.data?.data ?? response.data ?? []))
      .catch(() => setReviewers([]))
  }, [mode])

  const openAssignment = (item: UsulanItem, stage: 1 | 2) => {
    const assigned = stage === 1 ? item.penilai ?? [] : item.penilai_tahap2 ?? []
    setAssignmentTarget(item)
    setAssignmentStage(stage)
    setSelectedReviewers(new Set(assigned.map((reviewer) => String(reviewer.id))))
    setAssignmentError('')
  }

  const saveAssignment = async () => {
    if (!assignmentTarget) return
    setAssignmentSaving(true)
    setAssignmentError('')
    try {
      // Select values are strings, while the API validates reviewer IDs as integers.
      await assignPenilai(assignmentTarget.id, [...selectedReviewers].map(Number), assignmentStage)
      notify('Penugasan reviewer berhasil disimpan.', 'success')
      setAssignmentTarget(null)
      await fetchList()
    } catch (err: unknown) {
      setAssignmentError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan penugasan reviewer.' : 'Gagal menyimpan penugasan reviewer.')
    } finally {
      setAssignmentSaving(false)
    }
  }

  const reviewersForAssignment = assignmentTarget
    ? [
        ...reviewers,
        ...(assignmentStage === 1 ? assignmentTarget.penilai ?? [] : assignmentTarget.penilai_tahap2 ?? [])
          .filter((assignedReviewer) => !reviewers.some((reviewer) => String(reviewer.id) === String(assignedReviewer.id)))
          .map((assignedReviewer) => ({ id: assignedReviewer.id, nama_lengkap: assignedReviewer.nama_lengkap ?? `Reviewer ${assignedReviewer.id}` })),
      ]
    : []
  const assignedReviewerIds = new Set((assignmentTarget
    ? assignmentStage === 1 ? assignmentTarget.penilai ?? [] : assignmentTarget.penilai_tahap2 ?? []
    : []).map((reviewer) => String(reviewer.id)))
  const signedReviewerIds = new Set((assignmentTarget?.usulan_signatures ?? [])
    .filter((signature) => signature.tahap === assignmentStage)
    .map((signature) => String(signature.user_id)))
  const availableReviewers = reviewersForAssignment.filter((reviewer) =>
    !selectedReviewers.has(String(reviewer.id))
    && (signedReviewerIds.size === 0 || assignedReviewerIds.has(String(reviewer.id))),
  )

  const clearFilters = () => {
    setSearch('')
    setStatusFilter('')
    setStartDate('')
    setEndDate('')
    setSatkerFilter('')
    setSortOrder('desc')
    setPage(1)
  }

  const downloadSatkerSummary = async () => {
    if (summaryLoading || satkerSummary.length === 0) return

    setSummaryExporting(true)
    try {
      const totalUsulan = satkerSummary.reduce((total, satker) => total + satker.jumlah_usulan, 0)
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'SIAPIN'
      workbook.subject = `Rekap usulan per satker tahun ${selectedYear}`
      const worksheet = workbook.addWorksheet('Rekap Satker')
      worksheet.columns = [
        { key: 'no', width: 12 },
        { key: 'satker', width: 42 },
        { key: 'jumlah', width: 34 },
      ]

      worksheet.mergeCells('A1:C1')
      const titleCell = worksheet.getCell('A1')
      titleCell.value = 'Rekap Usulan per Satker'
      titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087F78' } }
      titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
      titleCell.border = {
        top: { style: 'thin', color: { argb: 'FF333333' } },
        bottom: { style: 'thin', color: { argb: 'FF333333' } },
        left: { style: 'thin', color: { argb: 'FF333333' } },
        right: { style: 'thin', color: { argb: 'FF333333' } },
      }
      worksheet.getRow(1).height = 30

      worksheet.mergeCells('A2:A3')
      worksheet.getCell('A2').value = 'No'
      worksheet.getCell('B2').value = `${satkerSummary.length} Satker mengusulkan`
      worksheet.getCell('B3').value = 'Satker'
      worksheet.getCell('C2').value = `${totalUsulan} Total inovasi usulan masuk`
      worksheet.getCell('C3').value = 'Jumlah inovasi'

      for (let rowIndex = 2; rowIndex <= 3; rowIndex++) {
        const row = worksheet.getRow(rowIndex)
        row.height = rowIndex === 2 ? 26 : 22
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: 'Arial', size: 11, bold: true }
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF333333' } },
            bottom: { style: 'thin', color: { argb: 'FF333333' } },
            left: { style: 'thin', color: { argb: 'FF333333' } },
            right: { style: 'thin', color: { argb: 'FF333333' } },
          }
        })
      }

      satkerSummary.forEach((satker, index) => {
        const row = worksheet.addRow([index + 1, satker.nama_satker, satker.jumlah_usulan])
        row.height = 21
        row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
          cell.font = { name: 'Arial', size: 11 }
          cell.alignment = {
            vertical: 'middle',
            horizontal: columnNumber === 2 ? 'left' : 'center',
            wrapText: true,
          }
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF333333' } },
            bottom: { style: 'thin', color: { argb: 'FF333333' } },
            left: { style: 'thin', color: { argb: 'FF333333' } },
            right: { style: 'thin', color: { argb: 'FF333333' } },
          }
        })
      })

      worksheet.views = [{ state: 'frozen', ySplit: 3 }]
      const buffer = await workbook.xlsx.writeBuffer()
      const stage = tahap === 2 ? 'Tahap_2' : 'Seleksi_Awal'
      saveAs(
        new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `Rekap_Usulan_Satker_${selectedYear}_${stage}.xlsx`,
      )
      notify('Rekap satker berhasil diunduh.', 'success')
    } catch {
      notify('Gagal membuat file Excel rekap satker.', 'error')
    } finally {
      setSummaryExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">{mode === 'INOVASI' ? 'Inovasi' : 'Penilaian'}</h2>
          <p className="text-sm text-gray-500">{mode === 'INOVASI' ? 'Semua inovasi yang sudah diajukan. Buka detail self assessment atau atur reviewer.' : 'Daftar inovasi yang ditugaskan kepada akun Anda untuk dinilai.'}</p>
        </div>
        <button onClick={clearFilters} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16l-6.5 7.2V18l-3 1.5v-7.3L4 5Z" /><path strokeLinecap="round" strokeLinejoin="round" d="m17 16 4 4m0-4-4 4" /></svg>
          Hapus filter
        </button>
      </div>

      <YearSelect value={selectedYear} placeholder="Pilih tahun" onChange={(year) => { setData([]); setLoading(Boolean(year)); setSelectedYear(year); setPage(1) }} />

      {selectedYear ? <>
      <TableToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1) }} searchPlaceholder="Cari inovasi, unit, PIC, atau tahun..." sortOrder={sortOrder} onSortOrderChange={(value) => { setSortOrder(value); setPage(1) }} filtersOpen={filtersOpen} onFiltersOpenChange={setFiltersOpen} actions={mode === 'INOVASI' ? <>
        <button type="button" onClick={() => setSummaryOpen(true)} className="inline-flex h-9 items-center gap-2 rounded-md bg-gradient-to-r from-teal-600 to-cyan-600 px-3 text-sm font-semibold text-white shadow-sm shadow-teal-200 transition hover:from-teal-700 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:ring-offset-2">
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5V14m5 5.5V9m5 10.5V4m5 15.5v-8" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.5 20.5h19" /></svg>
          Rekap Satker
        </button>
      </> : undefined}>
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
              <button type="button" onClick={() => void downloadSatkerSummary()} disabled={summaryLoading || summaryExporting || satkerSummary.length === 0} className="mr-2 inline-flex h-9 items-center gap-2 rounded-lg bg-gradient-to-r from-teal-600 to-cyan-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:from-teal-700 hover:to-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" /></svg>
                {summaryExporting ? 'Menyiapkan Excel...' : 'Unduh Excel'}
              </button>
              <button type="button" onClick={() => setSummaryOpen(false)} className="h-9 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-100">Tutup</button>
            </footer>
          </>}
        </section>
      </div>}

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="w-14 border-b px-3 py-4 text-center sm:px-4">No</th>
                <th className="border-b px-4 py-4 sm:px-6">Tanggal Masuk</th>
                <th className="border-b px-4 py-4 sm:px-6">Unit</th>
                <th className="border-b px-4 py-4 sm:px-6">Judul Inovasi</th>
                <th className="border-b px-4 py-4 sm:px-6">PIC (Nama / No. HP)</th>
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
                      <td className="px-4 py-3.5 text-gray-600 sm:px-6">
                        <div className="space-y-1.5">
                          {(Array.isArray(item.pic_penanggung_jawab) && item.pic_penanggung_jawab.length
                            ? item.pic_penanggung_jawab
                            : [{ nama: item.pic_nama || item.penanggung_jawab, no_whatsapp: item.pic_telp }]
                          ).map((contact, contactIndex) => <div key={`${contact.nama || 'pic'}-${contactIndex}`} className="min-w-[180px]">
                            <p className="font-medium text-slate-700">{contact.nama || '-'}</p>
                            <p className="text-xs text-slate-500">{contact.no_whatsapp || '-'}</p>
                          </div>)}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 sm:px-6">
                        {(() => { const status = getStatusPresentation(item, tahap); const stageLabel = tahap === 1 ? 'Seleksi Awal' : 'Penilaian Akhir'; const label = status.label === 'Lolos' || status.label === 'Tidak Lolos' ? `${status.label} ${stageLabel}` : status.label; return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{label}</span> })()}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
                        <div className="inline-flex items-center justify-end gap-2">
                          {mode === 'INOVASI' ? <>
                            <button type="button" onClick={() => navigate(`/tim-penilai/inovasi/${item.id}`)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800" title="Lihat self assessment Satker">
                              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"/><circle cx="12" cy="12" r="3"/></svg>
                              Detail
                            </button>
                            <button type="button" onClick={() => openAssignment(item, 1)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100" title="Atur reviewer">
                              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4 3v6m3-3h-6"/></svg>
                              Atur penilai
                            </button>
                          </> : <button type="button" aria-label="Buka penilaian" title="Buka penilaian" onClick={() => navigate(`/tim-penilai/penilaian/${item.id}`)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white transition hover:bg-violet-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2">
                            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="5" y="4.5" width="14" height="17" rx="2"/><path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5V3h6v1.5M8.5 11h7m-7 4h7m-7 4h4"/></svg>
                          </button>}
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
      {assignmentTarget && <div className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !assignmentSaving) setAssignmentTarget(null) }}>
        <section role="dialog" aria-modal="true" aria-labelledby="reviewer-assignment-title" className="my-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-5 sm:px-8">
            <h2 id="reviewer-assignment-title" className="text-xl font-semibold text-slate-800 sm:text-2xl">Atur Penilai · {assignmentStage === 1 ? 'Seleksi Awal' : 'Penilaian Akhir'}</h2>
            <button type="button" aria-label="Tutup" disabled={assignmentSaving} onClick={() => setAssignmentTarget(null)} className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button>
          </header>

          <div className="space-y-6 px-5 py-6 sm:px-8">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Inovasi terpilih</p>
              <div className="rounded-xl border border-teal-100 bg-teal-50 px-4 py-4 font-semibold leading-6 text-teal-950">{assignmentTarget.judul || assignmentTarget.nama_inovasi}</div>
            </div>

            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Tahap penilaian
              <select value={assignmentStage} onChange={(event) => { const nextStage = Number(event.target.value) as 1 | 2; setAssignmentStage(nextStage); const assigned = nextStage === 1 ? assignmentTarget.penilai ?? [] : assignmentTarget.penilai_tahap2 ?? []; setSelectedReviewers(new Set(assigned.map((reviewer) => String(reviewer.id)))) }} className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-normal text-slate-700 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100">
                <option value={1}>Tahap 1 · Seleksi Awal</option>
                {assignmentTarget.status === 'SELESAI_EVALUASI' && <option value={2}>Tahap 2 · Penilaian Akhir</option>}
              </select>
            </label>
            <div>
              <label htmlFor="reviewer-picker" className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Akun penilai</label>
              <div className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-slate-300 px-3 py-2 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-100">
                {[...selectedReviewers].map((reviewerId) => {
                  const reviewer = reviewersForAssignment.find((candidate) => String(candidate.id) === reviewerId)
                  if (!reviewer) return null
                  const locked = assignmentSaving || signedReviewerIds.has(reviewerId)
                  return <span key={reviewerId} className="inline-flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 py-2 pl-3 pr-2 text-sm font-medium text-teal-800">
                    {reviewer.nama_lengkap}
                    {signedReviewerIds.has(reviewerId) && <span className="text-xs font-normal text-teal-700">Sudah TTD</span>}
                    <button type="button" disabled={locked} aria-label={`Hapus ${reviewer.nama_lengkap}`} onClick={() => setSelectedReviewers((current) => { const next = new Set(current); next.delete(reviewerId); return next })} className="rounded-full p-0.5 text-teal-600 transition hover:bg-teal-200 hover:text-teal-900 disabled:cursor-not-allowed disabled:opacity-40"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18"/></svg></button>
                  </span>
                })}
                <select id="reviewer-picker" value="" disabled={assignmentSaving || availableReviewers.length === 0} onChange={(event) => { const reviewerId = event.target.value; if (reviewerId) setSelectedReviewers((current) => new Set([...current, reviewerId])) }} className="min-h-10 min-w-[220px] flex-1 bg-transparent px-2 text-sm text-slate-600 outline-none disabled:cursor-not-allowed disabled:text-slate-400">
                  <option value="">{availableReviewers.length ? '+ Tambah akun penilai...' : 'Semua akun penilai telah dipilih'}</option>
                  {availableReviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.nama_lengkap}</option>)}
                </select>
              </div>
              <p className="mt-1 text-xs text-slate-500">Hapus akun yang belum TTD lewat tombol ×. Akun yang sudah TTD tetap terkunci dan tidak dapat dihapus.</p>
              {signedReviewerIds.size > 0 && <p className="mt-1 text-xs text-amber-700">Reviewer baru tidak dapat ditambahkan setelah tanda tangan masuk pada tahap ini. Aturan ini tidak mengunci penugasan tahap lainnya.</p>}
            </div>

            {selectedReviewers.size === 0 && assignedReviewerIds.size > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Semua penugasan reviewer yang belum TTD akan dihapus dari tahap ini.</p>}
            {assignmentError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{assignmentError}</div>}
          </div>

          <footer className="flex justify-end gap-3 border-t border-slate-200 px-5 py-5 sm:px-8">
            <button type="button" disabled={assignmentSaving} onClick={() => setAssignmentTarget(null)} className="rounded-xl border border-slate-300 px-5 py-3 font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">Batal</button>
            <button type="button" disabled={assignmentSaving || (selectedReviewers.size === 0 && assignedReviewerIds.size === 0)} onClick={() => void saveAssignment()} className="rounded-xl bg-teal-700 px-6 py-3 font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50">{assignmentSaving ? 'Menyimpan...' : selectedReviewers.size === 0 && assignedReviewerIds.size > 0 ? 'Hapus Penugasan' : 'Simpan Penugasan'}</button>
          </footer>
        </section>
      </div>}
      </> : <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-500">Pilih tahun pengajuan untuk menampilkan usulan inovasi reviewer.</div>}

    </div>
  )
}
