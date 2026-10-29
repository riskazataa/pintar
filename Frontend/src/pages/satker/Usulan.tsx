import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  getUsulanList,
  getUsulanDetail,
  createUsulan,
  updateUsulan,
  deleteUsulan,
  getAssessmentQuestions,
} from '../../services/inovasi.service'

interface UsulanItem {
  id: string
  tanggal_masuk?: string
  createdAt?: string
  created_at?: string
  nama_satker?: string
  nama_inovasi?: string
  judul?: string
  penanggung_jawab?: string
  pic_nama?: string
  no_telp?: string
  pic_telp?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PERBAIKAN' | 'SELESAI_EVALUASI'
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number
}

// PERBAIKAN 1: Hapus kategori dari interface AssessmentQuestion
interface AssessmentQuestion {
  id: string; pertanyaan: string; parent_id?: string | number | null
}

interface AnswerEntry {
  question_id: string; checked: boolean; catatan: string
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'PERBAIKAN', label: 'Perbaikan' },
]

const JENIS_INOVASI_OPTIONS = [
  'Kebijakan/regulasi', 'Teknologi Kesehatan', 'Teknologi sistem informasi',
  'Pelayanan publik', 'Budaya kerja', 'Metode kerja', 'MoU/perjanjian',
  'Produk prototipe', 'Lainnya',
]

const KRITERIA_INOVASI_OPTIONS = [
  'Kebaharuan', 'Orisinil', 'Modifikasi', 'Memudahkan pelayanan',
  'Mempercepat pelayanan', 'Disebarluaskan', 'Bermanfaat', 'Spesifik',
  'Berkelanjutan', 'Solusi/upaya pemecahan masalah',
  'Dapat diaplikasikan di Internal dan atau eksternal', 'Percontohan nasional',
]

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
  PERBAIKAN: 'bg-blue-100 text-blue-700',
  SELESAI_EVALUASI: 'bg-emerald-100 text-emerald-700',
}

function getUser() {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return dateStr }
}

// PERBAIKAN 2: Tambahkan fungsi buildTreeStructure yang bersih
function buildTreeStructure(questions: any[]) {
  const parents = questions.filter((q: any) => !q.parent_id)
  return parents.flatMap((parent: any, pIdx: number) => {
    const children = questions.filter((q: any) => q.parent_id === parent.id)
    const parentRow = { no: `${pIdx + 1}.`, q: parent, isChild: false }
    const childRows = children.map((child: any, cIdx: number) => ({
      no: `${String.fromCharCode(97 + cIdx)}.`, // a, b, c
      q: child,
      isChild: true,
    }))
    return [parentRow, ...childRows]
  })
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

export default function Usulan() {
  const navigate = useNavigate()
  const user = getUser()
  const userSatker = user?.satker?.nama_satker || user?.nama_satker || ''

  const [data, setData] = useState<UsulanItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UsulanItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [step, setStep] = useState(1)
  const [namaInovasi, setNamaInovasi] = useState('')
  const [tahun, setTahun] = useState(new Date().getFullYear().toString())
  const [jenisInovasi, setJenisInovasi] = useState('')
  const [jenisLainnya, setJenisLainnya] = useState('')
  const [kriteria, setKriteria] = useState<string[]>([])
  const [linkDataDukung, setLinkDataDukung] = useState('')
  const [penanggungJawab, setPenanggungJawab] = useState('')
  const [noWhatsapp, setNoWhatsapp] = useState('')
  
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, AnswerEntry>>({})
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [catatanPerbaikan, setCatatanPerbaikan] = useState('')
  const [detailUsulan, setDetailUsulan] = useState<any>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsulanList({ page, limit: 10, search: search || undefined, status: statusFilter || undefined, startDate: startDate || undefined, endDate: endDate || undefined })
      const body = res.data
      const list: UsulanItem[] = Array.isArray(body) ? body : body.data ?? []
      setData(list.filter((item) => item.status !== 'SELESAI_EVALUASI'))
      setMeta(body.meta ?? body.pagination ?? { page, limit: 10, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat data' : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [page, search, statusFilter, startDate, endDate])

  useEffect(() => { fetchList() }, [fetchList, refreshKey])

  const loadQuestions = async () => {
    setQuestionsLoading(true)
    try {
      const { data: qData } = await getAssessmentQuestions()
      let flatQuestions: AssessmentQuestion[] = []
      const rawList = Array.isArray(qData) ? qData : qData.data ?? []

      // PERBAIKAN 3: Flattening data questions tanpa mempedulikan kategori
      rawList.forEach((item: any) => {
        flatQuestions.push({ id: item.id, pertanyaan: item.pertanyaan, parent_id: item.parent_id || null })
        if (item.children && Array.isArray(item.children)) {
          item.children.forEach((child: any) => {
            flatQuestions.push({ id: child.id, pertanyaan: child.pertanyaan, parent_id: item.id })
          })
        }
      })

      setQuestions(flatQuestions)
      
      const existingAnswers = detailUsulan?.assessment_answers || []
      const init: Record<string, AnswerEntry> = {}
      
      flatQuestions.forEach((q, idx) => {
        const safeId = String(q.id || `darurat-${idx}`) 
        const existing = existingAnswers.find((a: any) => String(a.question_id) === safeId)
        
        init[safeId] = {
          question_id: safeId,
          checked: existing ? (existing.jawaban_boolean ?? false) : false,
          catatan: existing ? (existing.catatan_string || '') : '',
        }
      })
      
      setAnswers(init)
    } catch { 
      setQuestions([]) 
    } finally { 
      setQuestionsLoading(false) 
    }
  }

  const openCreate = () => {
    setEditingId(null); setStep(1); setNamaInovasi(''); setTahun(new Date().getFullYear().toString()); setJenisInovasi(''); setJenisLainnya(''); setKriteria([]); setLinkDataDukung(''); setPenanggungJawab(''); setNoWhatsapp(''); setAnswers({}); setQuestions([]); setCatatanPerbaikan(''); setDetailUsulan(null); setModalOpen(true)
  }

  const openEdit = async (item: UsulanItem) => {
    setEditingId(item.id); setStep(1); setModalOpen(true)
    try {
      const res = await getUsulanDetail(item.id)
      const detail = res.data?.data || res.data
      setDetailUsulan(detail)
      setNamaInovasi(detail.judul || '')
      setTahun(detail.tahun?.toString() || new Date().getFullYear().toString())
      setJenisInovasi(detail.jenis_inovasi || '')
      setJenisLainnya(detail.jenis_inovasi_lainnya || '')
      setKriteria(detail.kriteria_inovasi || [])
      setLinkDataDukung(detail.link_data_dukung || '')
      setPenanggungJawab(detail.pic_nama || '')
      setNoWhatsapp(detail.pic_telp || '')
      setCatatanPerbaikan(detail.catatan_perbaikan || '')
      setAnswers({})
      setQuestions([])
    } catch {
      alert('Gagal memuat data usulan')
      setModalOpen(false)
    }
  }

  const handleSubmit = async () => {
    if (step === 1) {
      if ([namaInovasi, tahun, jenisInovasi, penanggungJawab, noWhatsapp].some((v) => !v.trim())) { alert('Lengkapi semua field wajib.'); return }
      await loadQuestions()
      setStep(2)
      return
    }

    setSaving(true)
    const payload = {
      judul: namaInovasi, tahun: parseInt(tahun, 10), jenis_inovasi: jenisInovasi === 'Lainnya' ? jenisLainnya : jenisInovasi, kriteria_inovasi: kriteria, link_data_dukung: linkDataDukung, pic_nama: penanggungJawab, pic_telp: noWhatsapp,
      assessment_answers: Object.values(answers).map(a => ({ question_id: parseInt(a.question_id, 10) || 0, jawaban_boolean: a.checked, catatan_string: a.catatan })),
    }

    try {
      editingId ? await updateUsulan(editingId, payload) : await createUsulan(payload)
      setModalOpen(false)
      setCatatanPerbaikan('')
      setDetailUsulan(null)
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      alert(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan' : 'Terjadi kesalahan')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteUsulan(deleteTarget.id)
      setDeleteTarget(null)
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      alert(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menghapus' : 'Terjadi kesalahan')
    } finally { setDeleting(false) }
  }

  const toggleKriteria = (val: string) => setKriteria((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val])
  const handleSearch = () => { setPage(1); fetchList() }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Usulan Inovasi</h2>
          <p className="text-sm text-gray-500">Kelola usulan inovasi satuan kerja</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Tambah Usulan
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">Cari</label>
          <div className="relative">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Cari nama inovasi..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <div className="w-full sm:w-40">
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="w-full sm:w-40">
          <label className="mb-1 block text-xs font-medium text-gray-500">Dari Tanggal</label>
          <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1) }} className="w-full rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
        </div>
        <div className="w-full sm:w-40">
          <label className="mb-1 block text-xs font-medium text-gray-500">Sampai Tanggal</label>
          <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1) }} className="w-full rounded-lg border border-gray-300 py-2 px-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
        </div>
        <button onClick={handleSearch} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Cari</button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <th className="px-4 py-3 sm:px-6">Tanggal Masuk</th>
                <th className="px-4 py-3 sm:px-6">Nama Satker</th>
                <th className="px-4 py-3 sm:px-6">Nama Inovasi</th>
                <th className="hidden px-4 py-3 sm:table-cell sm:px-6">Penanggung Jawab</th>
                <th className="hidden px-4 py-3 md:table-cell sm:px-6">No. Telp</th>
                <th className="px-4 py-3 sm:px-6">Status</th>
                <th className="px-4 py-3 text-right sm:px-6">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">Memuat data...</td></tr> : data.length === 0 ? <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">Belum ada usulan inovasi</td></tr> : data.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-gray-50/50">
                  <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{formatDate(item.createdAt || item.created_at || item.tanggal_masuk)}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 font-medium text-gray-800 sm:px-6">{item.nama_satker || userSatker}</td>
                  <td className="px-4 py-3.5 text-gray-800 sm:px-6">{item.judul || item.nama_inovasi}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-gray-600 sm:table-cell sm:px-6">{item.pic_nama || item.penanggung_jawab || '-'}</td>
                  <td className="hidden whitespace-nowrap px-4 py-3.5 text-gray-600 md:table-cell sm:px-6">{item.pic_telp || item.no_telp || '-'}</td>
                  <td className="whitespace-nowrap px-4 py-3.5 sm:px-6">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] || 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
                    <div className="inline-flex items-center gap-0.5">
                      <button onClick={() => navigate(`/satker/usulan/${item.id}`)} className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" title="Detail">
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      </button>
                      {item.status === 'PERBAIKAN' && (
                        <>
                          <button onClick={() => openEdit(item)} className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" title="Edit">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          </button>
                          <button onClick={() => setDeleteTarget(item)} className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600" title="Hapus">
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Paginator meta={meta} onPage={(p) => setPage(p)} />
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-gray-800">Hapus Usulan</h2>
            <p className="mb-6 text-sm text-gray-500">Yakin ingin menghapus <strong>{deleteTarget.judul || deleteTarget.nama_inovasi}</strong>?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Batal</button>
              <button onClick={handleDelete} disabled={deleting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60">{deleting ? 'Menghapus...' : 'Hapus'}</button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-800">{editingId ? 'Edit Usulan' : 'Tambah Usulan'}</h2>
              <button onClick={() => { setModalOpen(false); setCatatanPerbaikan(''); setDetailUsulan(null) }} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="flex border-b bg-gray-50/50 px-6 py-3">
              {[1, 2].map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
                  <span className={`text-sm font-medium ${step >= s ? 'text-blue-700' : 'text-gray-400'}`}>{s === 1 ? 'Data Usulan' : 'Self Assessment'}</span>
                  {s < 2 && <div className={`mx-3 h-px w-8 ${step >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`} />}
                </div>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {editingId && catatanPerbaikan && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <svg className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div><strong>Catatan Perbaikan dari Tim Penilai:</strong> {catatanPerbaikan}</div>
                </div>
              )}
              {step === 1 && (
                <div className="space-y-4">
                  {/* ... Kode Step 1 tetap sama persis ... */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nama Inovasi <span className="text-red-500">*</span></label>
                    <input type="text" value={namaInovasi} onChange={(e) => setNamaInovasi(e.target.value)} placeholder="Masukkan nama inovasi" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nama Satker</label>
                    <input type="text" value={userSatker} readOnly className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Tahun Inovasi <span className="text-red-500">*</span></label>
                      <input type="number" value={tahun} onChange={(e) => setTahun(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Jenis Inovasi <span className="text-red-500">*</span></label>
                      <select value={jenisInovasi} onChange={(e) => setJenisInovasi(e.target.value)} className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200">
                        <option value="">Pilih jenis</option>
                        {JENIS_INOVASI_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  </div>
                  {jenisInovasi === 'Lainnya' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Jenis Inovasi (Lainnya) <span className="text-red-500">*</span></label>
                      <input type="text" value={jenisLainnya} onChange={(e) => setJenisLainnya(e.target.value)} placeholder="Sebutkan jenis inovasi" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
                    </div>
                  )}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">Kriteria Inovasi</label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {KRITERIA_INOVASI_OPTIONS.map((k) => (
                        <label key={k} className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 transition hover:border-blue-300 hover:bg-blue-50/30 cursor-pointer">
                          <input type="checkbox" checked={kriteria.includes(k)} onChange={() => toggleKriteria(k)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                          <span className="text-sm text-gray-700">{k}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Link Data Dukung</label>
                    <input type="url" value={linkDataDukung} onChange={(e) => setLinkDataDukung(e.target.value)} placeholder="https://..." className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Nama Penanggung Jawab <span className="text-red-500">*</span></label>
                      <input type="text" value={penanggungJawab} onChange={(e) => setPenanggungJawab(e.target.value)} placeholder="Nama lengkap" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">No. WhatsApp <span className="text-red-500">*</span></label>
                      <input type="text" value={noWhatsapp} onChange={(e) => setNoWhatsapp(e.target.value)} placeholder="08xxxxxxxxxx" className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
                    </div>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-gray-500">Silakan isi self assessment untuk usulan inovasi ini dengan mencentang kolom "Ya" dan memberikan catatan jika diperlukan.</p>
                  {questionsLoading ? (
                    <div className="animate-pulse space-y-4">{[1, 2, 3].map((i) => (<div key={i} className="h-12 w-full rounded bg-gray-100" />))}</div>
                  ) : questions.length === 0 ? (
                    <p className="text-sm text-gray-400">Tidak ada pertanyaan assessment.</p>
                  ) : (
                    // PERBAIKAN 4: Ganti tabel menjadi flat list dengan parent-child (TANPA KATEGORI)
                    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                      <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold">
                          <tr>
                            <th className="px-6 py-4 w-16 text-center">NO</th>
                            <th className="px-6 py-4">KRITERIA PENILAIAN</th>
                            <th className="px-6 py-4 w-24 text-center">YA</th>
                            <th className="px-6 py-4 w-64">CATATAN</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {buildTreeStructure(questions).map(({ no, q, isChild }) => {
                            const safeId = String(q.id)
                            const ans = answers[safeId] || { question_id: safeId, checked: false, catatan: '' }
                            return (
                              <tr key={safeId} className={`transition-colors hover:bg-gray-50 ${isChild ? 'bg-gray-50/30' : ''}`}>
                                <td className={`px-6 py-4 align-top font-medium text-center ${isChild ? 'text-gray-400' : 'text-gray-800'}`}>
                                  {no}
                                </td>
                                <td className={`px-6 py-4 align-top ${isChild ? 'text-gray-600 pl-8' : 'font-bold text-gray-800'}`}>
                                  {q.pertanyaan}
                                </td>
                                <td className="px-6 py-4 align-top text-center">
                                  <input
                                    type="checkbox"
                                    checked={ans.checked}
                                    onChange={(e) => setAnswers(prev => ({ ...prev, [safeId]: { ...prev[safeId], checked: e.target.checked } }))}
                                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                  />
                                </td>
                                <td className="px-6 py-4 align-top">
                                  <input
                                    type="text"
                                    placeholder="Ketik catatan..."
                                    value={ans.catatan}
                                    onChange={(e) => setAnswers(prev => ({ ...prev, [safeId]: { ...prev[safeId], catatan: e.target.value } }))}
                                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                                  />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t px-6 py-4">
              <div>{step === 2 && (<button onClick={() => setStep(1)} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">Kembali</button>)}</div>
              <button onClick={handleSubmit} disabled={saving || (step === 2 && questionsLoading)} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">{saving ? 'Menyimpan...' : step === 1 ? 'Selanjutnya' : 'Submit Usulan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}