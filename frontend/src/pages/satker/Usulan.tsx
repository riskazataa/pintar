import { useEffect, useState, useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  getUsulanList,
  getUsulanDetail,
  createUsulan,
  updateUsulan,
  deleteUsulan,
  getAssessmentQuestions,
  getBAColumns,
} from '../../services/inovasi.service'
import type { BAColumn } from '../../services/inovasi.service'
import BAAnswerGrid from '../tim-penilai/BAAnswerGrid'
import { getStatusPresentation } from '../../utils/inovasi-status'
import TablePagination from '../../components/TablePagination'
import TableToolbar, { type TableSortOrder } from '../../components/TableToolbar'
import { useNotifications } from '../../components/NotificationProvider'
import { KRITERIA_PEMBARUAN, normalizeKriteriaInovasi } from '../../utils/kriteria-inovasi'

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
  hasil_penilaian?: string | null
  hasil_penilaian_tahap1?: string | null
  usulan_signatures?: { user_id: string | number; tahap: number; keputusan?: string | null }[]
  penilai?: { id: string | number }[]
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number
}

// PERBAIKAN 1: Hapus kategori dari interface AssessmentQuestion
interface AssessmentQuestion { id: string | number; pertanyaan: string; satker_lock_mode?: 'NONE' | 'RINCIAN' | 'ROW'; question_title_override?: string; column_titles?: string[]; is_header?: boolean; parent_id?: string | number | null }

interface AnswerEntry {
  question_id: string
  jawaban_boolean: boolean
  catatan_string: string
  link?: string
  custom_values: Record<string, string | number | boolean>
}

interface FormErrors {
  namaInovasi?: string
  deskripsiInovasi?: string
  tahun?: string
  jenisInovasi?: string
  linkDataDukung?: string
  penanggungJawab?: string
  noWhatsapp?: string
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'SEDANG_DIREVIEW', label: 'Sedang Direview' },
  { value: 'MENUNGGU_TTD', label: 'Menunggu Tanda Tangan' },
  { value: 'LOLOS', label: 'Lolos' },
  { value: 'TIDAK_LOLOS', label: 'Tidak Lolos' },
  { value: 'PERBAIKAN', label: 'Perlu Perbaikan' },
]

const JENIS_INOVASI_OPTIONS = [
  'Kebijakan/regulasi', 'Teknologi Kesehatan', 'Teknologi sistem informasi',
  'Pelayanan publik', 'Budaya kerja', 'Metode kerja', 'MoU/perjanjian',
  'Produk prototipe',
]

const KRITERIA_INOVASI_OPTIONS = [
  KRITERIA_PEMBARUAN, 'Memudahkan pelayanan',
  'Mempercepat pelayanan', 'Disebarluaskan', 'Bermanfaat', 'Spesifik',
  'Berkelanjutan', 'Solusi/upaya pemecahan masalah',
  'Dapat diaplikasikan di Internal dan atau eksternal', 'Percontohan nasional',
]

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

function isValidSupportLink(value: string) {
  try {
    const url = new URL(value.trim())
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname)
  } catch {
    return false
  }
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

export default function Usulan() {
  const { notify } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const isCreatePage = location.pathname === '/satker/usulan/tambah'
  const user = getUser()
  const userSatker = user?.satker?.nama_satker || user?.nama_satker || ''

  const [data, setData] = useState<UsulanItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<TableSortOrder>('desc')

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<UsulanItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [step, setStep] = useState(1)
  const [namaInovasi, setNamaInovasi] = useState('')
  const [deskripsiInovasi, setDeskripsiInovasi] = useState('')
  const [tahun, setTahun] = useState(new Date().getFullYear().toString())
  const [jenisInovasi, setJenisInovasi] = useState<string[]>([])
  const [jenisPickerOpen, setJenisPickerOpen] = useState(false)
  const [kriteria, setKriteria] = useState<string[]>([])
  const [linkDataDukung, setLinkDataDukung] = useState('')
  const [penanggungJawab, setPenanggungJawab] = useState('')
  const [noWhatsapp, setNoWhatsapp] = useState('')
  const [formErrors, setFormErrors] = useState<FormErrors>({})
  const [showAssessmentErrors, setShowAssessmentErrors] = useState(false)
  
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([])
  const [assessmentColumns, setAssessmentColumns] = useState<BAColumn[]>([])
  const [questionTitle, setQuestionTitle] = useState('Kriteria Penilaian')
  const [answers, setAnswers] = useState<Record<string, AnswerEntry>>({})
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [catatanPerbaikan, setCatatanPerbaikan] = useState('')
  const [detailUsulan, setDetailUsulan] = useState<any>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsulanList({ page, limit, search: search || undefined, hasil: statusFilter || undefined, startDate: startDate || undefined, endDate: endDate || undefined, sort_order: sortOrder })
      const body = res.data
      const list: UsulanItem[] = Array.isArray(body) ? body : body.data ?? []
      setData(statusFilter ? list : list.filter((item) => item.status !== 'SELESAI_EVALUASI'))
      setMeta(body.meta ? { ...body.meta, totalPages: body.meta.total_pages ?? body.meta.totalPages } : body.pagination ?? { page, limit, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat data' : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter, startDate, endDate, sortOrder])

  useEffect(() => { if (!isCreatePage) fetchList() }, [fetchList, refreshKey, isCreatePage])

  const loadQuestions = async () => {
    setQuestionsLoading(true)
    try {
      const [{ data: qData }, { data: template }] = await Promise.all([getAssessmentQuestions(1), getBAColumns(1)])
      let flatQuestions: AssessmentQuestion[] = []
      const rawList = Array.isArray(qData) ? qData : qData.data ?? []

      rawList.forEach((item: any) => {
        flatQuestions.push({ ...item, id: item.id, pertanyaan: item.pertanyaan, is_header: item.is_header, parent_id: item.parent_id || null })
        if (item.children && Array.isArray(item.children)) {
          item.children.forEach((child: any) => {
            flatQuestions.push({ ...child, id: child.id, pertanyaan: child.pertanyaan, is_header: child.is_header, parent_id: item.id })
          })
        }
      })

      setQuestions(flatQuestions)
      setAssessmentColumns(template.columns ?? [])
      setQuestionTitle(template.questionTitle || 'Kriteria Penilaian')
      
      const existingAnswers = detailUsulan?.assessment_answers || []
      const init: Record<string, AnswerEntry> = {}
      
      flatQuestions.forEach((q, idx) => {
        const safeId = String(q.id || `darurat-${idx}`) 
        const existing = existingAnswers.find((a: any) => String(a.question_id) === safeId)
        
        init[safeId] = {
          question_id: safeId,
          jawaban_boolean: existing ? (existing.jawaban_boolean ?? false) : false,
          catatan_string: existing ? (existing.catatan_string || '') : '',
          link: existing?.link || '',
          custom_values: existing?.custom_values || {},
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
    setEditingId(null); setStep(1); setNamaInovasi(''); setDeskripsiInovasi(''); setTahun(new Date().getFullYear().toString()); setJenisInovasi([]); setJenisPickerOpen(false); setKriteria([]); setLinkDataDukung(''); setPenanggungJawab(''); setNoWhatsapp(''); setAnswers({}); setQuestions([]); setAssessmentColumns([]); setCatatanPerbaikan(''); setDetailUsulan(null); setFormErrors({}); setShowAssessmentErrors(false); setModalOpen(false)
    navigate('/satker/usulan/tambah')
  }

  const openEdit = async (item: UsulanItem) => {
    setEditingId(item.id); setStep(1); setModalOpen(true); setFormErrors({}); setShowAssessmentErrors(false)
    try {
      const res = await getUsulanDetail(item.id)
      const detail = res.data?.data || res.data
      setDetailUsulan(detail)
      setNamaInovasi(detail.judul || '')
      setDeskripsiInovasi(detail.deskripsi_inovasi || '')
      setTahun(detail.tahun?.toString() || new Date().getFullYear().toString())
      const savedTypes = Array.isArray(detail.jenis_inovasi_pilihan) && detail.jenis_inovasi_pilihan.length
        ? detail.jenis_inovasi_pilihan.flatMap((type: string) => {
          if (type !== 'Lainnya') return [type]
          const legacyCustomType = detail.jenis_inovasi_lainnya || (detail.jenis_inovasi && !detail.jenis_inovasi_pilihan.includes(detail.jenis_inovasi) ? detail.jenis_inovasi : 'Lainnya')
          return [legacyCustomType]
        })
        : detail.jenis_inovasi ? [detail.jenis_inovasi === 'Lainnya' && detail.jenis_inovasi_lainnya ? detail.jenis_inovasi_lainnya : detail.jenis_inovasi] : []
      setJenisInovasi(savedTypes)
      setJenisPickerOpen(false)
      setKriteria(normalizeKriteriaInovasi(detail.kriteria_inovasi))
      setLinkDataDukung(detail.link_data_dukung || '')
      setPenanggungJawab(detail.pic_nama || '')
      setNoWhatsapp(detail.pic_telp || '')
      setCatatanPerbaikan(detail.catatan_perbaikan || '')
      setAnswers({})
      setQuestions([])
      setAssessmentColumns([])
    } catch {
      notify('Gagal memuat data usulan.', 'error')
      setModalOpen(false)
    }
  }

  const handleSubmit = async () => {
    if (step === 1) {
      const errors: FormErrors = {}
      if (!namaInovasi.trim()) errors.namaInovasi = 'Nama inovasi wajib diisi.'
      if (!deskripsiInovasi.trim()) errors.deskripsiInovasi = 'Deskripsi singkat inovasi wajib diisi.'
      if (!tahun.trim()) errors.tahun = 'Tahun inovasi wajib diisi.'
      if (!jenisInovasi.length) errors.jenisInovasi = 'Pilih minimal satu jenis inovasi.'
      if (!linkDataDukung.trim()) errors.linkDataDukung = 'Link data dukung wajib diisi.'
      else if (!isValidSupportLink(linkDataDukung)) errors.linkDataDukung = 'Masukkan tautan lengkap yang diawali http:// atau https://.'
      if (!penanggungJawab.trim()) errors.penanggungJawab = 'Nama penanggung jawab wajib diisi.'
      if (!noWhatsapp.trim()) errors.noWhatsapp = 'Nomor WhatsApp wajib diisi.'
      else if (!/^(?:08\d{8,11}|\+628\d{7,10})$/.test(noWhatsapp)) {
        errors.noWhatsapp = 'Gunakan nomor 10–13 digit yang diawali 08 atau +628.'
      }
      setFormErrors(errors)
      if (Object.keys(errors).length) { notify('Periksa kembali field yang ditandai merah.', 'warning'); return }
      if (!questions.length) await loadQuestions()
      setStep(2)
      return
    }

    setSaving(true)
    const missingColumn = assessmentColumns.find((column) => column.required && column.type !== 'readonly' && Object.values(answers).some((answer) => {
      const question = questions.find((q) => String(q.id) === answer.question_id)
      if (question?.is_header || question?.satker_lock_mode === 'ROW') return false
      const value = column.type === 'readonly'
        ? column.defaultValue
        : answer.custom_values?.[column.key] ?? (column.key === 'jawaban_boolean' ? answer.jawaban_boolean : column.key === 'catatan_string' ? answer.catatan_string : column.key === 'link' ? answer.link : undefined)
      if (column.type === 'checkbox') return value !== true
      return value === undefined || value === null || (typeof value === 'string' && !value.trim())
    }))
    if (missingColumn) { setShowAssessmentErrors(true); notify('Kolom "' + missingColumn.title + '" wajib diisi pada pertanyaan yang masih kosong.', 'warning'); setSaving(false); return }
    const payload = {
      judul: namaInovasi, deskripsi_inovasi: deskripsiInovasi.trim(), tahun: parseInt(tahun, 10), jenis_inovasi: jenisInovasi[0], jenis_inovasi_pilihan: jenisInovasi, jenis_inovasi_lainnya: '', kriteria_inovasi: normalizeKriteriaInovasi(kriteria), link_data_dukung: linkDataDukung, pic_nama: penanggungJawab, pic_telp: noWhatsapp,
      assessment_answers: Object.values(answers).map((answer) => ({
        question_id: parseInt(answer.question_id, 10) || 0,
        jawaban_boolean: answer.jawaban_boolean,
        catatan_string: answer.catatan_string,
        link: answer.link || '',
        custom_values: answer.custom_values || {},
      })),
    }

    try {
      editingId ? await updateUsulan(editingId, payload) : await createUsulan(payload)
      notify(editingId ? 'Perbaikan usulan berhasil disimpan.' : 'Usulan berhasil dikirim.', 'success')
      setModalOpen(false)
      setCatatanPerbaikan('')
      setDetailUsulan(null)
      setRefreshKey((k) => k + 1)
      if (isCreatePage) navigate('/satker/usulan')
    } catch (err: unknown) {
      notify(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan' : 'Terjadi kesalahan', 'error')
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteUsulan(deleteTarget.id)
      notify('Usulan berhasil dihapus.', 'success')
      setDeleteTarget(null)
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      notify(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menghapus' : 'Terjadi kesalahan', 'error')
    } finally { setDeleting(false) }
  }

  const toggleKriteria = (val: string) => setKriteria((prev) => prev.includes(val) ? prev.filter((v) => v !== val) : [...prev, val])
  const orderedQuestions = buildTreeStructure(questions).map(({ q }) => q)
  const assessmentRows = orderedQuestions.map((question) => {
    const questionId = String(question.id)
    const answer = answers[questionId] ?? { jawaban_boolean: false, catatan_string: '', link: '', custom_values: {} }
    return {
      id: questionId,
      question_id: Number(question.id),
      question: { id: Number(question.id), pertanyaan: question.pertanyaan, is_header: question.is_header, satker_lock_mode: question.satker_lock_mode, question_title_override: question.question_title_override, column_titles: question.column_titles, parent_id: question.parent_id ? Number(question.parent_id) : null },
      jawaban_boolean: answer.jawaban_boolean,
      catatan_string: answer.catatan_string,
      link: answer.link || '',
      custom_values: answer.custom_values || {},
    }
  })

  const closeForm = () => {
    setModalOpen(false)
    setCatatanPerbaikan('')
    setDetailUsulan(null)
    if (isCreatePage) navigate('/satker/usulan')
  }

  return (
    <div className="space-y-6">
      {!isCreatePage && <>
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

      <TableToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1) }} searchPlaceholder="Cari nama inovasi..." sortOrder={sortOrder} onSortOrderChange={(value) => { setSortOrder(value); setPage(1) }}>
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
      </TableToolbar>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                <th className="px-4 py-3 sm:px-6">Tanggal Masuk</th>
                <th className="px-4 py-3 sm:px-6">Unit</th>
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
                    {(() => { const status = getStatusPresentation(item); return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span> })()}
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
        <TablePagination meta={meta} onPage={setPage} onLimitChange={(size) => { setLimit(size); setPage(1) }} />
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
      </>}

      {(modalOpen || isCreatePage) && (
        <div className={isCreatePage ? 'mx-auto w-full max-w-5xl' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4'}>
          <div className={isCreatePage ? 'overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm' : 'flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl'}>
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{editingId ? 'Edit Usulan' : 'Tambah Usulan'}</h2>
                {isCreatePage && <p className="mt-1 text-sm text-gray-500">Lengkapi data inovasi dan self assessment.</p>}
              </div>
              <button onClick={closeForm} className={isCreatePage ? 'rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50' : 'rounded-lg p-1 text-gray-400 hover:bg-gray-100'}>
                {isCreatePage ? 'Kembali ke daftar' : <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
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
            <div className={isCreatePage ? 'px-6 py-5' : 'flex-1 overflow-y-auto px-6 py-5'}>
              {editingId && catatanPerbaikan && (
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  <svg className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <div><strong>Catatan Perbaikan dari Reviewer:</strong> {catatanPerbaikan}</div>
                </div>
              )}
              {step === 1 && (
                <div className="space-y-4">
                  {/* ... Kode Step 1 tetap sama persis ... */}
                  <div>
                    <label className={`mb-1 block text-sm font-medium ${formErrors.namaInovasi ? 'text-red-600' : 'text-gray-700'}`}>Nama Inovasi <span className="text-red-500">*</span></label>
                    <input type="text" value={namaInovasi} onChange={(e) => { setNamaInovasi(e.target.value); setFormErrors((errors) => ({ ...errors, namaInovasi: undefined })) }} placeholder="Masukkan nama inovasi" aria-invalid={Boolean(formErrors.namaInovasi)} className={`w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2 ${formErrors.namaInovasi ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-100' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`} />
                    {formErrors.namaInovasi && <p className="mt-1 text-xs text-red-600">{formErrors.namaInovasi}</p>}
                  </div>
                  <div>
                    <label htmlFor="deskripsi-inovasi" className={`mb-1 block text-sm font-medium ${formErrors.deskripsiInovasi ? 'text-red-600' : 'text-gray-700'}`}>Deskripsi Singkat Inovasi <span className="text-red-500">*</span></label>
                    <textarea id="deskripsi-inovasi" required rows={3} maxLength={1000} value={deskripsiInovasi} onChange={(e) => { setDeskripsiInovasi(e.target.value); setFormErrors((errors) => ({ ...errors, deskripsiInovasi: undefined })) }} placeholder="Jelaskan inovasi, masalah yang diatasi, cara kerja, dan manfaatnya secara singkat." aria-invalid={Boolean(formErrors.deskripsiInovasi)} className={`w-full resize-y rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2 ${formErrors.deskripsiInovasi ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-100' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`} />
                    <div className="mt-1 flex justify-between text-xs"><span className={formErrors.deskripsiInovasi ? 'text-red-600' : 'text-gray-500'}>{formErrors.deskripsiInovasi || 'Ceritakan secara ringkas apa inovasinya dan manfaatnya.'}</span><span className="text-gray-400">{deskripsiInovasi.length}/1000</span></div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Nama Unit</label>
                    <input type="text" value={userSatker} readOnly className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={`mb-1 block text-sm font-medium ${formErrors.tahun ? 'text-red-600' : 'text-gray-700'}`}>Tahun Inovasi <span className="text-red-500">*</span></label>
                      <input type="number" value={tahun} onChange={(e) => { setTahun(e.target.value); setFormErrors((errors) => ({ ...errors, tahun: undefined })) }} aria-invalid={Boolean(formErrors.tahun)} className={`w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2 ${formErrors.tahun ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-100' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`} />
                      {formErrors.tahun && <p className="mt-1 text-xs text-red-600">{formErrors.tahun}</p>}
                    </div>
                    <div>
                      <label className={`mb-1 block text-sm font-medium ${formErrors.jenisInovasi ? 'text-red-600' : 'text-gray-700'}`}>Jenis Inovasi <span className="text-red-500">*</span></label>
                      <div className="relative">
                        <div className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-sm focus-within:ring-2 ${formErrors.jenisInovasi ? 'border-red-400 focus-within:ring-red-100' : 'border-gray-300 focus-within:border-blue-500 focus-within:ring-blue-100'}`}>
                          <span className="flex min-w-0 flex-wrap gap-1.5">{jenisInovasi.map((jenis) => <span key={jenis} className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">{jenis}<button type="button" aria-label={`Hapus ${jenis}`} onClick={() => setJenisInovasi((items) => items.filter((item) => item !== jenis))} className="ml-1 text-blue-400 hover:text-blue-700">×</button></span>)}</span>
                          <button type="button" aria-expanded={jenisPickerOpen} aria-label="Pilih jenis inovasi" onClick={() => setJenisPickerOpen((open) => !open)} className="min-w-28 shrink-0 text-right text-gray-500">{jenisInovasi.length ? '+ Tambah jenis' : 'Pilih jenis'} ⌄</button>
                        </div>
                        {jenisPickerOpen && <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">{JENIS_INOVASI_OPTIONS.map((jenis) => <label key={jenis} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-blue-50"><input type="checkbox" checked={jenisInovasi.includes(jenis)} onChange={() => { setJenisInovasi((items) => items.includes(jenis) ? items.filter((item) => item !== jenis) : [...items, jenis]); setFormErrors((errors) => ({ ...errors, jenisInovasi: undefined })) }} className="h-4 w-4 rounded border-gray-300 accent-blue-600" />{jenis}</label>)}<button type="button" onClick={() => setJenisPickerOpen(false)} className="mt-1 w-full rounded-lg bg-blue-50 py-2 text-xs font-semibold text-blue-700">Selesai</button></div>}
                      </div>
                      {formErrors.jenisInovasi && <p className="mt-1 text-xs text-red-600">{formErrors.jenisInovasi}</p>}
                    </div>
                  </div>
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
                    <label className={`mb-1 block text-sm font-medium ${formErrors.linkDataDukung ? 'text-red-600' : 'text-gray-700'}`}>Link Data Dukung <span className="text-red-500">*</span></label>
                    <input type="url" required value={linkDataDukung} onChange={(e) => { setLinkDataDukung(e.target.value); setFormErrors((errors) => ({ ...errors, linkDataDukung: undefined })) }} placeholder="https://..." aria-invalid={Boolean(formErrors.linkDataDukung)} className={`w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2 ${formErrors.linkDataDukung ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-100' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`} />
                    {formErrors.linkDataDukung && <p className="mt-1 text-xs text-red-600">{formErrors.linkDataDukung}</p>}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={`mb-1 block text-sm font-medium ${formErrors.penanggungJawab ? 'text-red-600' : 'text-gray-700'}`}>Nama Penanggung Jawab <span className="text-red-500">*</span></label>
                      <input type="text" value={penanggungJawab} onChange={(e) => { setPenanggungJawab(e.target.value); setFormErrors((errors) => ({ ...errors, penanggungJawab: undefined })) }} placeholder="Nama lengkap" aria-invalid={Boolean(formErrors.penanggungJawab)} className={`w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2 ${formErrors.penanggungJawab ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-100' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`} />
                      {formErrors.penanggungJawab && <p className="mt-1 text-xs text-red-600">{formErrors.penanggungJawab}</p>}
                    </div>
                    <div>
                      <label className={`mb-1 block text-sm font-medium ${formErrors.noWhatsapp ? 'text-red-600' : 'text-gray-700'}`}>No. WhatsApp <span className="text-red-500">*</span></label>
                      <input type="tel" inputMode="tel" autoComplete="tel" maxLength={14} value={noWhatsapp} onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d+]/g, '')
                        const hasPlusPrefix = raw.startsWith('+')
                        const compact = hasPlusPrefix ? `+${raw.slice(1).replace(/\+/g, '')}` : raw.replace(/\+/g, '')
                        const digits = compact.replace(/\D/g, '').slice(0, 13)
                        setNoWhatsapp(hasPlusPrefix ? `+${digits}` : digits)
                        setFormErrors((errors) => ({ ...errors, noWhatsapp: undefined }))
                      }} placeholder="08xxxxxxxxxx atau +628xxxxxxxxxx" aria-invalid={Boolean(formErrors.noWhatsapp)} className={`w-full rounded-lg border px-4 py-2.5 text-sm outline-none focus:ring-2 ${formErrors.noWhatsapp ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-100' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-200'}`} />
                      {formErrors.noWhatsapp ? <p className="mt-1 text-xs text-red-600">{formErrors.noWhatsapp}</p> : <p className="mt-1 text-xs text-gray-500">10–13 digit, diawali 08 atau +628.</p>}
                    </div>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-4">
                  <div><p className="text-sm font-medium text-gray-700">Self assessment mengikuti template Tahap 1 dari Management BA.</p><p className="mt-1 text-sm text-gray-500">Isi setiap kolom sesuai jenis dan aturan yang ditentukan pada template.</p></div>
                  {questionsLoading ? (
                    <div className="animate-pulse space-y-4">{[1, 2, 3].map((i) => (<div key={i} className="h-12 w-full rounded bg-gray-100" />))}</div>
                  ) : questions.length === 0 ? (
                    <p className="text-sm text-gray-400">Tidak ada pertanyaan assessment.</p>
                  ) : (
                    <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-gray-200 bg-white">
                      <BAAnswerGrid
                        satkerMode
                        questionTitle={questionTitle}
                        answers={assessmentRows}
                        columns={assessmentColumns}
                        values={answers}
                        showRequiredErrors={showAssessmentErrors}
                        disabled={false}
                        onChange={(answerId, value) => setAnswers((previous) => ({
                          ...previous,
                          [answerId]: { ...value, question_id: answerId },
                        }))}
                      />
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
