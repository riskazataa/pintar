import { Fragment, useEffect, useState } from 'react'
import axios from 'axios'
import {
  createAssessmentQuestion,
  createAssessmentQuestions,
  deleteAssessmentQuestion,
  deleteAssessmentQuestions,
  getAssessmentQuestions,
  getBAColumns,
  reorderAssessmentQuestions,
  saveBAColumns,
  updateAssessmentQuestion,
} from '../../services/inovasi.service'
import type { BAColumn } from '../../services/inovasi.service'
import TablePagination from '../../components/TablePagination'
import { useNotifications } from '../../components/NotificationProvider'
import { CONCLUSION_MARKER } from '../../utils/ba-conclusion'

type SatkerLockMode = 'NONE' | 'RINCIAN' | 'ROW'
type Question = { id: number; pertanyaan: string; satker_lock_mode?: SatkerLockMode; is_header?: boolean; question_title_override?: string | null; column_titles?: string[] | null; tahap: number; parent_id: number | null; inherited?: boolean; children?: Question[] }
type IconName = 'plus' | 'save' | 'text' | 'longText' | 'readonly' | 'number' | 'score' | 'select' | 'radio' | 'checkbox' | 'date' | 'url' | 'settings' | 'chevron' | 'trash' | 'edit' | 'layers' | 'close' | 'check' | 'arrowLeft' | 'arrowRight' | 'grip' | 'refresh' | 'sparkles'

const typeLabels: Record<BAColumn['type'], string> = {
  readonly: 'Baca saja', text: 'Teks', textarea: 'Teks panjang', number: 'Angka', score: 'Skor / penilaian',
  select: 'Daftar pilihan', radio: 'Pilihan tunggal', checkbox: 'Kotak centang', date: 'Tanggal', url: 'Tautan',
}
const typeIcons: Record<BAColumn['type'], IconName> = {
  readonly: 'readonly', text: 'text', textarea: 'longText', number: 'number', score: 'score',
  select: 'select', radio: 'radio', checkbox: 'checkbox', date: 'date', url: 'url',
}
const secondaryButton = 'inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:cursor-not-allowed disabled:opacity-50'

function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    plus: <path d="M12 5v14m-7-7h14" />,
    save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" /><path d="M17 21v-8H7v8M7 3v5h8" /></>,
    text: <><path d="M4 7V4h16v3M9 20h6M12 4v16" /></>,
    longText: <><path d="M4 6h16M4 12h16M4 18h10" /><path d="M2 4v4m20-4v4" /></>,
    readonly: <><circle cx="12" cy="12" r="9" /><path d="M8 12h8m-8 4h5" /></>,
    number: <><path d="M4 9h16M4 15h16M10 3 8 21m8-18-2 18" /></>,
    score: <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    select: <><path d="m7 10 5 5 5-5" /><path d="M4 4h16v16H4z" /></>,
    radio: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
    checkbox: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="m7 12 3 3 7-7" /></>,
    date: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    url: <><path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.7 1.7 0 1 1-2.4 2.4l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a1.7 1.7 0 1 1-3.4 0v-.2a1.7 1.7 0 0 0-2.9-1.2l-.1.1a1.7 1.7 0 1 1-2.4-2.4l.1-.1a1.7 1.7 0 0 0-1.2-2.9H4a1.7 1.7 0 1 1 0-3.4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a1.7 1.7 0 1 1 2.4-2.4l.1.1a1.7 1.7 0 0 0 2.9-1.2V2a1.7 1.7 0 1 1 3.4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a1.7 1.7 0 1 1 2.4 2.4l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a1.7 1.7 0 1 1 0 3.4h-.2a1.7 1.7 0 0 0-1.2 2.9Z" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 12 9 5 9-5m-18 5 9 5 9-5" /></>,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrowLeft: <><path d="M19 12H5m7 7-7-7 7-7" /></>,
    arrowRight: <><path d="M5 12h14m-7-7 7 7-7 7" /></>,
    grip: <><circle cx="9" cy="5" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="19" r="1" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></>,
    sparkles: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" /><path d="m19 14 1.2 2.8L23 18l-2.8 1.2L19 22l-1.2-2.8L15 18l2.8-1.2L19 14ZM5 2l.8 2.2L8 5l-2.2.8L5 8l-.8-2.2L2 5l2.2-.8L5 2Z" /></>,
  }
  return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function QuestionModal({ row, saving, columns, questionTitle, onChange, onHeaderChange, onLockChange, onQuestionTitleChange, onColumnTitleChange, onCancel, onSave }: {
  row: { id?: number; parent_id: number | null; pertanyaan: string; satker_lock_mode?: SatkerLockMode; is_header?: boolean; question_title_override?: string; column_titles?: string[] }
  saving: boolean
  columns: BAColumn[]
  questionTitle: string
  onChange: (text: string) => void
  onLockChange: (value: SatkerLockMode) => void
  onHeaderChange: (value: boolean) => void
  onQuestionTitleChange: (value: string) => void
  onColumnTitleChange: (index: number, value: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  const isChild = Boolean(row.parent_id)
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/70 bg-white shadow-2xl shadow-slate-900/20">
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
        <div className="flex gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon name={isChild ? 'layers' : 'text'} /></div><div><h3 className="font-semibold text-slate-900">{row.is_header ? 'Header bagian (tanpa isian)' : row.id ? 'Edit baris' : isChild ? 'Tambah subbaris' : 'Tambah baris'}</h3><p className="mt-1 text-xs text-slate-500">Tulis kriteria yang akan muncul di tabel penilaian.</p></div></div>
        <button onClick={onCancel} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="close" /></button>
      </div>
      {!isChild && <label className="mx-6 mt-5 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><input type="checkbox" checked={Boolean(row.is_header)} onChange={(event) => onHeaderChange(event.target.checked)} />Header bagian — judul pemisah tanpa isian</label>}
      {row.is_header && <div className="space-y-3 px-6 pt-5"><p className="text-xs leading-5 text-slate-500">Atur judul kolom khusus untuk tabel pada bagian ini. Kosongkan untuk memakai judul umum Management BA.</p><label className="block text-sm font-medium text-slate-700">Judul kolom pertanyaan<input value={row.question_title_override ?? ''} onChange={(event) => onQuestionTitleChange(event.target.value)} placeholder={questionTitle} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal" /></label>{columns.map((column, index) => <label key={column.key} className="block text-sm font-medium text-slate-700">Judul kolom: {column.title}<input value={row.column_titles?.[index] ?? ''} onChange={(event) => onColumnTitleChange(index, event.target.value)} placeholder={column.title} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal" /></label>)}</div>}
      {row.question_title_override === CONCLUSION_MARKER ? <p className="mx-6 mt-4 text-sm text-slate-600">Kesimpulan diisi reviewer Penilaian Akhir. Satker hanya dapat melihatnya. Pilihan Lainnya menyediakan catatan.</p> : !row.is_header && <label className="mx-6 mt-4 block text-sm text-slate-700">Kunci isian Satker<select value={row.satker_lock_mode ?? 'NONE'} onChange={(event) => onLockChange(event.target.value as SatkerLockMode)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3"><option value="NONE">Tidak dikunci</option><option value="RINCIAN">Kunci kolom Rincian saja</option><option value="ROW">Kunci seluruh baris</option></select><span className="mt-1 block text-xs text-slate-500">Pilih sesuai kebutuhan setiap baris. Kunci Rincian tetap mengizinkan kolom penilaian, catatan, dan tautan.</span></label>}
      <div className="p-6"><p className="mb-3 text-xs text-slate-500">Rincian boleh dikosongkan untuk diisi Unit.</p><label className="mb-2 block text-sm font-medium text-slate-700">Nama baris</label><textarea autoFocus rows={4} value={row.pertanyaan} onChange={(event) => onChange(event.target.value)} className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="Contoh: Kesesuaian dengan kebijakan atau regulasi" /></div>
      <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4"><button onClick={onCancel} className={secondaryButton}>Batal</button><button disabled={saving || (row.is_header && !row.pertanyaan.trim())} onClick={onSave} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Icon name="check" />}{saving ? 'Menyimpan' : 'Simpan baris'}</button></div>
    </div>
  </div>
}

export default function ManagementBA() {
  const { confirm } = useNotifications()
  const [tahap, setTahap] = useState(1)
  const [rowPage, setRowPage] = useState(1)
  const [rowLimit, setRowLimit] = useState(10)
  const [questions, setQuestions] = useState<Question[]>([])
  const [questionTitle, setQuestionTitle] = useState('Pertanyaan / Kriteria')
  const [reportHeader, setReportHeader] = useState({ title: 'DESK INOVASI IMPLEMENTASI SAKIP', dateText: '', logo: '' })
  const [columns, setColumns] = useState<BAColumn[]>([])
  const [inheritedColumnKeys, setInheritedColumnKeys] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  const [columnEditor, setColumnEditor] = useState<string | null>(null)
  const [rowEditor, setRowEditor] = useState<{ id?: number; parent_id: number | null; pertanyaan: string; satker_lock_mode?: SatkerLockMode; is_header?: boolean; question_title_override?: string; column_titles?: string[] } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null)
  const [selectedRowIds, setSelectedRowIds] = useState<number[]>([])
  const [draggedRowId, setDraggedRowId] = useState<number | null>(null)
  const [bulkRowsOpen, setBulkRowsOpen] = useState(false)
  const [bulkRowsText, setBulkRowsText] = useState('')
  const [bulkEmptyCount, setBulkEmptyCount] = useState(0)
  const [bulkParentId, setBulkParentId] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setMessage('')
    Promise.all([getAssessmentQuestions(tahap), getBAColumns(tahap)]).then(([rows, cols]) => {
      if (!active) return
      setQuestions(Array.isArray(rows.data) ? rows.data : rows.data.data ?? [])
      setQuestionTitle(cols.data.questionTitle || 'Pertanyaan / Kriteria')
      setReportHeader({ title: cols.data.reportHeader?.title ?? 'DESK INOVASI IMPLEMENTASI SAKIP', dateText: cols.data.reportHeader?.dateText ?? '', logo: cols.data.reportHeader?.logo ?? '' })
      setInheritedColumnKeys(cols.data.inheritedColumnKeys ?? [])
      setColumns(cols.data.columns); setDirty(false)
    }).catch((e) => { if (active) setError(axios.isAxiosError(e) ? e.response?.data?.message || 'Tidak dapat memuat template BA' : 'Tidak dapat memuat template BA') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tahap, reload])

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const updateColumn = (key: string, values: Partial<BAColumn>) => {
    setColumns((previous) => previous.map((column) => column.key === key ? { ...column, ...values } : column))
    setDirty(true); setMessage('')
  }
  const addColumn = () => {
    const key = `field_${crypto.randomUUID().replaceAll('-', '')}`
    setColumns((previous) => [...previous, { key, title: 'Kolom baru', type: 'text', required: false, options: [] }])
    setDirty(true); setMessage(''); setColumnEditor(key)
  }
  const uploadLogo = async (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Pilih logo PNG atau JPG dengan ukuran maksimal 2 MB.'); return
    }
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      image.src = url
      await image.decode()
      const scale = Math.min(1, 500 / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Canvas tidak tersedia')
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const logo = canvas.toDataURL('image/png')
      if (logo.length > 1400000) throw new Error('Logo terlalu besar')
      setReportHeader((current) => ({ ...current, logo }))
      setDirty(true); setError(''); setMessage('')
    } catch { setError('Logo tidak dapat dibaca. Gunakan gambar PNG atau JPG lain.') }
    finally { URL.revokeObjectURL(url) }
  }
  const saveColumns = async () => {
    setSaving(true); setError('')
    try { await saveBAColumns(tahap, columns, questionTitle, reportHeader); setDirty(false); setMessage('Template berhasil disimpan.') }
    catch (e) { setError(axios.isAxiosError(e) ? e.response?.data?.message || 'Gagal menyimpan template' : 'Gagal menyimpan template') }
    finally { setSaving(false) }
  }
  const saveRow = async () => {
    if (!rowEditor || (rowEditor.is_header && !rowEditor.pertanyaan.trim())) return
    setSaving(true); setError('')
    try {
      if (rowEditor.id) await updateAssessmentQuestion(rowEditor.id, { pertanyaan: rowEditor.pertanyaan, satker_lock_mode: rowEditor.satker_lock_mode ?? 'NONE', is_header: rowEditor.is_header, question_title_override: rowEditor.question_title_override || '', column_titles: rowEditor.column_titles ?? [], tahap })
      else await createAssessmentQuestion({ pertanyaan: rowEditor.pertanyaan, satker_lock_mode: rowEditor.satker_lock_mode ?? 'NONE', is_header: rowEditor.is_header, question_title_override: rowEditor.question_title_override || '', column_titles: rowEditor.column_titles ?? [], parent_id: rowEditor.parent_id, tahap })
      const response = await getAssessmentQuestions(tahap)
      setQuestions(Array.isArray(response.data) ? response.data : response.data.data ?? []); setRowEditor(null)
      setMessage(rowEditor.id ? 'Baris berhasil diperbarui.' : 'Baris berhasil ditambahkan.')
    } catch (e) { setError(axios.isAxiosError(e) ? e.response?.data?.message || 'Gagal menyimpan baris' : 'Gagal menyimpan baris') }
    finally { setSaving(false) }
  }
  const lockSelected = async (satker_lock_mode: SatkerLockMode) => {
    setSaving(true); setError('');
    try {
      await Promise.all(rows.filter((row) => selectedRowIds.includes(row.id) && !row.is_header && !row.inherited).map((row) => updateAssessmentQuestion(row.id, { pertanyaan: row.pertanyaan, satker_lock_mode })));
      setReload((value) => value + 1); setSelectedRowIds([]);
      setMessage(satker_lock_mode === 'ROW' ? 'Seluruh kolom pada baris terpilih dikunci untuk Unit.' : satker_lock_mode === 'RINCIAN' ? 'Kolom Rincian pada baris terpilih dikunci untuk Unit.' : 'Kunci Satker pada baris terpilih dibuka.');
    } catch { setError('Gagal mengatur kunci baris'); } finally { setSaving(false); }
  }
  const removeRow = async () => {
    if (!deleteTarget) return
    setSaving(true); setError('')
    try {
      await deleteAssessmentQuestion(String(deleteTarget.id), tahap)
      const response = await getAssessmentQuestions(tahap)
      setQuestions(Array.isArray(response.data) ? response.data : response.data.data ?? [])
      setMessage(tahap === 2 && deleteTarget.inherited ? 'Baris dihapus dari BA Penilaian Akhir. BA Seleksi Awal tetap utuh.' : 'Baris berhasil dihapus.'); setDeleteTarget(null)
    } catch { setError('Gagal menghapus baris') }
    finally { setSaving(false) }
  }

  const saveBulkRows = async () => {
    const prompts = [...bulkRowsText.split(/\r?\n/).map((row) => row.trim()).filter(Boolean), ...Array.from({ length: bulkEmptyCount }, () => '')]
    if (!prompts.length) { setError('Masukkan setidaknya satu pertanyaan.'); return }
    if (prompts.length > 100) { setError('Maksimal 100 baris dalam satu kali tambah.'); return }
    setSaving(true); setError('')
    try {
      await createAssessmentQuestions(prompts.map((pertanyaan) => ({ pertanyaan, tahap, section_header_id: bulkParentId ? Number(bulkParentId) : null })))
      const response = await getAssessmentQuestions(tahap)
      setQuestions(Array.isArray(response.data) ? response.data : response.data.data ?? [])
      setBulkRowsText(''); setBulkParentId(''); setBulkRowsOpen(false)
      setMessage(`${prompts.length} baris berhasil ditambahkan.`)
    } catch (e) { setError(axios.isAxiosError(e) ? e.response?.data?.message || 'Gagal menambahkan baris' : 'Gagal menambahkan baris') }
    finally { setSaving(false) }
  }

  const moveRow = async (targetId: number) => {
    if (draggedRowId === null || draggedRowId === targetId) return
    const source = rows.find((row) => row.id === draggedRowId)
    const target = rows.find((row) => row.id === targetId)
    if (!source || !target || source.inherited || target.inherited || source.tahap !== target.tahap || source.parent_id !== target.parent_id) return
    const parentId = source.parent_id
    let orderedIds: number[] = []
    const reorder = (items: Question[]) => {
      const siblings = items.filter((item) => item.tahap === source.tahap)
      const from = siblings.findIndex((item) => item.id === draggedRowId)
      const to = siblings.findIndex((item) => item.id === targetId)
      if (from < 0 || to < 0) return items
      const reordered = [...siblings]; const [moved] = reordered.splice(from, 1); reordered.splice(to, 0, moved)
      orderedIds = reordered.map((item) => item.id)
      let index = 0
      return items.map((item) => item.tahap === source.tahap ? reordered[index++] : item)
    }
    const next = parentId === null
      ? reorder(questions)
      : questions.map((parent) => parent.id === parentId ? { ...parent, children: reorder(parent.children ?? []) } : parent)
    if (!orderedIds.length) return
    setQuestions(next); setDraggedRowId(null); setError('')
    try { await reorderAssessmentQuestions(tahap, parentId, orderedIds) }
    catch (e) { setError(axios.isAxiosError(e) ? e.response?.data?.message || 'Gagal menyimpan urutan' : 'Gagal menyimpan urutan'); setReload((value) => value + 1) }
  }

  const removeSelectedRows = async () => {
    if (!selectedRowIds.length) return
    if (!(await confirm(`Hapus ${selectedRowIds.length} baris terpilih beserta subbarisnya?`, { title: 'Hapus beberapa baris?', confirmLabel: 'Hapus terpilih', destructive: true }))) return
    setSaving(true); setError('')
    try {
      await deleteAssessmentQuestions(selectedRowIds)
      const response = await getAssessmentQuestions(tahap)
      setQuestions(Array.isArray(response.data) ? response.data : response.data.data ?? [])
      setSelectedRowIds([]); setMessage(`${selectedRowIds.length} baris berhasil dihapus.`)
    } catch (e) { setError(axios.isAxiosError(e) ? e.response?.data?.message || 'Gagal menghapus baris terpilih' : 'Gagal menghapus baris terpilih') }
    finally { setSaving(false) }
  }

  let numberedQuestionCount = 0
  const rows = questions.flatMap((question) => {
    const number = question.is_header ? '' : String(++numberedQuestionCount)
    return [
      { ...question, number, isChild: false, inherited: tahap === 2 && question.tahap === 1 },
      ...(question.children ?? []).map((child, childIndex) => ({
        ...child,
        number: question.is_header ? String(childIndex + 1) : `${number}.${String.fromCharCode(97 + childIndex)}`,
        isChild: true,
        inherited: tahap === 2 && child.tahap === 1,
      })),
    ]
  })
  const rowTotalPages = Math.max(1, rowLimit === 0 ? 1 : Math.ceil(rows.length / rowLimit))
  const currentRowPage = Math.min(rowPage, rowTotalPages)
  const visibleRows = rowLimit === 0 ? rows : rows.slice((currentRowPage - 1) * rowLimit, currentRowPage * rowLimit)
  const selected = columns.find((column) => column.key === columnEditor)
  const handleStageChange = async (nextStage: number) => {
    if (dirty && !(await confirm('Perubahan template belum disimpan. Tetap pindah tahap?', { title: 'Perubahan belum tersimpan', confirmLabel: 'Pindah tahap' }))) return
    setTahap(nextStage); setRowPage(1); setColumnEditor(null); setRowEditor(null)
  }

  return <div className="mx-auto max-w-[1680px] space-y-6 pb-8">
    <header className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/70 to-indigo-50/70 px-6 py-6 shadow-sm sm:px-8">
      <div className="pointer-events-none absolute -right-8 -top-16 h-52 w-52 rounded-full bg-violet-200/30 blur-3xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white shadow-lg shadow-violet-200"><Icon name="layers" className="h-6 w-6" /></div><div><div className="mb-1 flex items-center gap-2"><h1 className="text-xl font-bold tracking-tight text-slate-900">Management BA Inovasi</h1><span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-semibold text-violet-700">TEMPLATE</span></div><p className="max-w-2xl text-sm leading-6 text-slate-600">Rancang baris kriteria dan kolom penilaian untuk berita acara.</p></div></div>
        <button disabled={saving || loading || !dirty || !questionTitle.trim() || columns.some((column) => !column.title.trim() || (['select', 'radio'].includes(column.type) && !column.options?.length))} onClick={saveColumns} className="inline-flex h-11 items-center gap-2.5 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white shadow-md shadow-violet-200 transition hover:-translate-y-0.5 hover:bg-violet-700 hover:shadow-lg disabled:translate-y-0 disabled:opacity-50">{saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Icon name="save" />}{saving ? 'Menyimpan...' : 'Simpan template'}</button>
      </div>
    </header>

    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-3 text-sm font-medium text-slate-600"><span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tahap</span><select disabled={saving} value={tahap} onChange={(event) => { void handleStageChange(Number(event.target.value)) }} className="h-10 min-w-36 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"><option value={1}>Seleksi Awal</option><option value={2}>Penilaian Akhir</option></select></label>
        <span className="hidden h-8 w-px bg-slate-200 sm:block" />
        {tahap === 2 && !questions.some((question) => question.question_title_override === CONCLUSION_MARKER) && <button disabled={loading || saving} className={secondaryButton} onClick={() => setRowEditor({ parent_id: null, pertanyaan: 'H. Kesimpulan', is_header: false, satker_lock_mode: 'ROW', question_title_override: CONCLUSION_MARKER })}>Tambah kesimpulan akhir</button>}
        <button disabled={loading || saving} className={secondaryButton} onClick={() => setRowEditor({ parent_id: null, pertanyaan: '', is_header: true })}><Icon name="layers" />Tambah header</button>
        <button disabled={loading || saving} className={secondaryButton} onClick={() => setRowEditor({ parent_id: null, pertanyaan: '' })}><Icon name="plus" className="h-4 w-4 text-violet-600" />Tambah baris</button>
        <button disabled={loading || saving} className={secondaryButton} onClick={() => setBulkRowsOpen(true)}><Icon name="layers" className="h-4 w-4 text-violet-600" />Tambah banyak</button>
        {selectedRowIds.length > 0 && <><button disabled={saving} className={secondaryButton} onClick={() => void lockSelected('RINCIAN')}>Kunci Rincian untuk Unit</button><button disabled={saving} className={secondaryButton} onClick={() => void lockSelected('ROW')}>Kunci seluruh baris</button><button disabled={saving} className={secondaryButton} onClick={() => void lockSelected('NONE')}>Buka kunci Satker</button></>}
        {selectedRowIds.length > 0 && <button disabled={loading || saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 text-sm font-semibold text-rose-700" onClick={() => void removeSelectedRows()}><Icon name="trash" />Hapus terpilih ({selectedRowIds.length})</button>}
        <button disabled={loading || saving} className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50" onClick={addColumn}><Icon name="plus" className="h-4 w-4" />Tambah kolom</button>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2"><Icon name="layers" className="h-3.5 w-3.5" />{rows.length} baris</span>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2"><Icon name="text" className="h-3.5 w-3.5" />{columns.length + 1} kolom</span>
        {dirty ? <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-amber-700"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Perubahan belum disimpan</span> : <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-emerald-700"><Icon name="check" className="h-3.5 w-3.5" />Tersimpan</span>}
      </div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Header Berita Acara Excel</h2>
      <p className="mt-1 text-sm text-slate-500">Atur judul kegiatan, logo, dan tempat/tanggal untuk tahap yang dipilih. Klik Simpan template untuk menyimpan.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">Judul kegiatan<input disabled={loading || saving} maxLength={300} value={reportHeader.title} onChange={(event) => { setReportHeader((current) => ({ ...current, title: event.target.value })); setDirty(true) }} placeholder="DESK INOVASI IMPLEMENTASI SAKIP TA 2025" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label>
        <label className="block text-sm font-medium text-slate-700">Tempat dan tanggal<input disabled={loading || saving} maxLength={200} value={reportHeader.dateText} onChange={(event) => { setReportHeader((current) => ({ ...current, dateText: event.target.value })); setDirty(true) }} placeholder="Jakarta, 23 s.d 25 Februari 2026" className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal" /></label>
        <div><label className="block text-sm font-medium text-slate-700">Logo<input type="file" accept="image/png,image/jpeg" disabled={loading || saving} onChange={(event) => { void uploadLogo(event.target.files?.[0]); event.target.value = '' }} className="mt-2 block w-full text-sm font-normal" /></label><p className="mt-2 text-xs text-slate-500">PNG atau JPG, maksimal 2 MB.</p>{reportHeader.logo && <div className="mt-3 flex items-center gap-4"><img src={reportHeader.logo} alt="Logo berita acara" className="h-24 w-32 object-contain" /><button type="button" disabled={loading || saving} onClick={() => { setReportHeader((current) => ({ ...current, logo: '' })); setDirty(true) }} className="text-sm text-rose-600">Hapus logo</button></div>}</div>
        <label className="block text-sm font-medium text-slate-700">Unit Utama<input readOnly value="Ditjen Penanggulangan Penyakit" className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal text-slate-600" /></label>
      </div>
    </section>

    {tahap === 2 && <div className="flex gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-6 text-indigo-800"><Icon name="layers" className="mt-1 h-4 w-4 shrink-0" /><p>Penilaian Akhir melanjutkan pertanyaan, kolom, dan hasil Seleksi Awal. Tambahkan pertanyaan atau kolom khusus Penilaian Akhir di sini. Baris dan kolom bertanda Seleksi Awal mengikuti template Seleksi Awal; jawaban yang ditampilkan mengikuti hasil masing-masing usulan.</p></div>}
    {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><Icon name="close" className="mt-0.5 h-4 w-4" /><span className="flex-1">{error}</span><button className="font-semibold underline underline-offset-2" onClick={() => setReload((value) => value + 1)}>Coba lagi</button></div>}
    {message && <div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3.5 text-sm font-medium text-emerald-700"><Icon name="check" />{message}</div>}

    {loading ? <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center shadow-sm"><span className="mx-auto mb-3 block h-8 w-8 animate-spin rounded-full border-[3px] border-violet-100 border-t-violet-600" /><p className="text-sm font-medium text-slate-600">Memuat template BA...</p></div> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {columns.length === 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-violet-50/50 px-5 py-3"><span className="text-sm text-slate-600">Belum ada kolom isian. Tambahkan kolom untuk mulai mengatur formulir.</span><button onClick={addColumn} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-violet-700"><Icon name="plus" />Tambah kolom</button></div>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead className="sticky top-0 z-20"><tr className="bg-slate-50 text-left text-slate-600">
            <th className="sticky left-0 z-30 w-[110px] min-w-[110px] border-b border-r border-slate-200 bg-slate-50 p-3">No</th>
            <th className="sticky left-[110px] z-30 min-w-[260px] border-b border-r border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2"><Icon name="text" className="ml-1 h-4 w-4 text-slate-400" /><input aria-label="Nama kolom rincian" readOnly={tahap === 2} maxLength={120} value={questionTitle} onChange={(event) => { setQuestionTitle(event.target.value); setDirty(true) }} className="w-full rounded-lg border border-transparent bg-transparent px-2 py-2 text-sm font-semibold text-slate-700 outline-none transition hover:bg-white focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-50" /></div></th>
            {columns.map((column) => <th key={column.key} className="min-w-[240px] border-b border-r border-slate-200 p-0"><button disabled={inheritedColumnKeys.includes(column.key)} title={inheritedColumnKeys.includes(column.key) ? 'Mengikuti kolom Seleksi Awal' : 'Pengaturan kolom'} onClick={() => setColumnEditor(column.key)} className="group flex min-h-[60px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition enabled:hover:bg-violet-50"><span className="flex min-w-0 items-center gap-2.5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200"><Icon name={typeIcons[column.type]} /></span><span className="truncate font-semibold text-slate-700">{column.title}{inheritedColumnKeys.includes(column.key) && <span className="block text-[10px] font-medium text-indigo-500">Dari Seleksi Awal</span>}</span>{column.required && <span className="text-rose-500">*</span>}</span>{!inheritedColumnKeys.includes(column.key) && <Icon name="chevron" className="h-4 w-4 rotate-90 text-slate-400 transition group-hover:text-violet-600" />}</button></th>)}
            <th className="sticky right-0 z-30 min-w-[126px] border-b border-slate-200 bg-slate-50 px-3 py-2"><button className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700" disabled={saving} onClick={addColumn}><Icon name="plus" />Kolom</button></th>
          </tr></thead>
          <tbody>{visibleRows.map((row) => row.is_header ? <Fragment key={row.id}><tr draggable={!row.inherited && !saving} onDragStart={() => setDraggedRowId(row.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void moveRow(row.id) }} className={`bg-slate-100 ${draggedRowId === row.id ? 'opacity-40' : ''}`}><td colSpan={columns.length + 2} className="border-b border-slate-200 px-4 py-3"><input type="checkbox" aria-label={`Pilih ${row.pertanyaan}`} disabled={row.inherited || saving} checked={selectedRowIds.includes(row.id)} onChange={(event) => setSelectedRowIds((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} className="mr-2 h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" /><button disabled={row.inherited || saving} onClick={() => setRowEditor({ id: row.id, parent_id: null, pertanyaan: row.pertanyaan, is_header: true, question_title_override: row.question_title_override ?? '', column_titles: row.column_titles ?? [] })} className="text-left text-sm font-bold text-slate-800">{row.pertanyaan}</button><span className="ml-3 text-xs text-slate-500">Header bagian · tarik untuk mengurutkan</span></td><td className="border-b border-slate-200 p-2">{!row.inherited && <div className="flex gap-2"><button title="Tambah pertanyaan dalam bagian" onClick={() => setRowEditor({ parent_id: row.id, pertanyaan: '' })}><Icon name="plus" /></button><button title="Hapus bagian" onClick={() => setDeleteTarget(row)}><Icon name="trash" /></button></div>}</td></tr><tr className="border-b bg-white text-xs font-semibold text-slate-600"><td className="px-3 py-2">No</td><td className="px-3 py-2">{row.question_title_override || questionTitle}</td>{columns.map((column,index)=><td key={column.key} className="px-3 py-2">{row.column_titles?.[index] || column.title}</td>)}<td /></tr></Fragment> : <tr key={row.id} draggable={!row.inherited && !saving} onDragStart={() => setDraggedRowId(row.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void moveRow(row.id) }} className={`group/row transition-colors hover:bg-violet-50/30 ${draggedRowId === row.id ? 'opacity-40' : ''}`}>
            <td className="sticky left-0 z-10 w-[110px] min-w-[110px] border-b border-r border-slate-100 bg-white p-2.5 group-hover/row:bg-violet-50/50">
              <div className="flex items-center gap-2">
                <span className={`flex h-7 min-w-7 items-center justify-center rounded-lg px-1 text-[11px] font-semibold ${row.isChild ? 'bg-slate-100 text-slate-500' : 'bg-violet-50 text-violet-700'}`}>{row.number}</span>
                <input type="checkbox" aria-label={`Pilih ${row.pertanyaan}`} disabled={row.inherited || saving} checked={selectedRowIds.includes(row.id)} onChange={(event) => setSelectedRowIds((ids) => event.target.checked ? [...ids, row.id] : ids.filter((id) => id !== row.id))} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
              </div>
            </td>
            <td className="sticky left-[110px] z-10 min-w-[260px] border-b border-r border-slate-100 bg-white p-2.5 group-hover/row:bg-violet-50/50">
              <div className={`flex items-center gap-2 ${row.isChild ? 'pl-5' : ''}`}>
                <button disabled={row.inherited || saving} className="min-w-0 flex-1 rounded-lg border border-transparent px-2.5 py-2 text-left text-sm text-slate-800 transition enabled:hover:border-violet-200 enabled:hover:bg-white" onClick={() => setRowEditor({ id: row.id, parent_id: row.parent_id, pertanyaan: row.pertanyaan, is_header: row.is_header, satker_lock_mode: row.satker_lock_mode, question_title_override: row.question_title_override ?? '', column_titles: row.column_titles ?? [] })}><span className="block truncate">{row.pertanyaan || 'Baris kosong — diisi Unit'}{row.satker_lock_mode === 'RINCIAN' && <span className="ml-2 text-xs text-amber-600">Rincian dikunci</span>}{row.satker_lock_mode === 'ROW' && <span className="ml-2 text-xs text-rose-600">Baris dikunci</span>}</span></button>
                {!row.inherited && <button title="Edit baris" disabled={saving} onClick={() => setRowEditor({ id: row.id, parent_id: row.parent_id, pertanyaan: row.pertanyaan, is_header: row.is_header, satker_lock_mode: row.satker_lock_mode, question_title_override: row.question_title_override ?? '', column_titles: row.column_titles ?? [] })} className="rounded-lg p-2 text-slate-300 opacity-0 transition hover:bg-white hover:text-violet-700 group-hover/row:opacity-100"><Icon name="edit" /></button>}
              </div>
            </td>
            {columns.map((column) => <td key={column.key} className="border-b border-r border-slate-100 p-3"><div className="flex min-h-10 items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 text-xs text-slate-400 transition group-hover/row:border-violet-100 group-hover/row:bg-white"><Icon name={typeIcons[column.type]} className="h-3.5 w-3.5 shrink-0 text-slate-300" /><span className="truncate">{typeLabels[column.type]}{(column.type === 'select' || column.type === 'radio') && column.options?.length ? ` · ${column.options.length} opsi` : ''}{column.required ? ' · wajib' : ''}</span></div></td>)}
            <td className="sticky right-0 z-10 whitespace-nowrap border-b border-slate-100 bg-white px-2 py-2 group-hover/row:bg-violet-50/50">
              {row.inherited ? <div className="flex items-center justify-center gap-1"><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-600">Dari Seleksi Awal</span>{tahap === 2 && <button title="Hapus dari Penilaian Akhir" disabled={saving} onClick={() => setDeleteTarget(row)} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-100 hover:text-rose-600"><Icon name="trash" /></button>}</div> : <div className="flex items-center justify-center gap-1"><button title="Tambah subbaris" disabled={saving} onClick={() => setRowEditor({ parent_id: row.parent_id || row.id, pertanyaan: '' })} className="rounded-lg p-2 text-slate-400 transition hover:bg-violet-100 hover:text-violet-700"><Icon name="plus" /></button><button title="Hapus baris" disabled={saving} onClick={() => setDeleteTarget(row)} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-100 hover:text-rose-600"><Icon name="trash" /></button></div>}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <TablePagination meta={{ page: currentRowPage, limit: rowLimit, total: rows.length, totalPages: rowTotalPages }} onPage={setRowPage} onLimitChange={(size) => { setRowLimit(size); setRowPage(1) }} />
      {!rows.length && <div className="px-6 py-16 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Icon name="sparkles" className="h-6 w-6" /></div><h3 className="font-semibold text-slate-800">Template masih kosong</h3><p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">Tambahkan baris kriteria, lalu atur kolom penilaiannya.</p><button onClick={() => setRowEditor({ parent_id: null, pertanyaan: '' })} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-700"><Icon name="plus" />Tambah baris pertama</button></div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1.5"><Icon name="sparkles" className="h-3.5 w-3.5 text-violet-500" />Klik nama kolom untuk mengatur jenis dan isian.</span><span>Geser tabel ke samping untuk melihat semua kolom.</span></div>
    </section>}

    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && setColumnEditor(null)}><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/70 bg-white shadow-2xl shadow-slate-900/20">
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon name={typeIcons[selected.type]} /></div><div><h3 className="font-semibold text-slate-900">Pengaturan kolom</h3><p className="mt-0.5 text-xs text-slate-500">Atur nama, jenis, dan aturan pengisian.</p></div></div><button onClick={() => setColumnEditor(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon name="close" /></button></div>
      <div className="space-y-4 p-6"><label className="block text-sm font-medium text-slate-700">Nama kolom<input maxLength={120} autoFocus value={selected.title} onChange={(event) => updateColumn(selected.key, { title: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm font-normal outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="Contoh: Hasil penilaian" /></label>
        <label className="block text-sm font-medium text-slate-700">Jenis isian<select value={selected.type} onChange={(event) => updateColumn(selected.key, { type: event.target.value as BAColumn['type'] })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-normal outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100">{Object.entries(typeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        {(selected.type === 'select' || selected.type === 'radio') && <label className="block text-sm font-medium text-slate-700">Pilihan <span className="font-normal text-slate-400">(satu per baris)</span><textarea rows={4} value={(selected.options ?? []).join('\n')} onChange={(event) => updateColumn(selected.key, { options: event.target.value.split('\n').map((option) => option.trim()).filter(Boolean) })} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3.5 py-3 text-sm font-normal outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder={'Contoh:\nLolos\nTidak Lolos\nPerlu perbaikan'} /><span className="mt-1 block text-xs font-normal text-slate-400">{selected.options?.length ?? 0} opsi</span></label>}
        {selected.type === 'readonly' && <label className="block text-sm font-medium text-slate-700">Nilai yang ditampilkan<input maxLength={500} value={selected.defaultValue ?? ''} onChange={(event) => updateColumn(selected.key, { defaultValue: event.target.value })} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3.5 text-sm font-normal outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" placeholder="Teks tetap untuk ditampilkan" /></label>}
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3.5 transition hover:border-violet-200 hover:bg-violet-50/40"><input type="checkbox" checked={selected.required} onChange={(event) => updateColumn(selected.key, { required: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" /><span><span className="block text-sm font-medium text-slate-700">Wajib diisi</span><span className="mt-0.5 block text-xs text-slate-500">Penilai harus mengisi kolom ini sebelum menyimpan.</span></span></label>
        <div className="flex items-center gap-2"><span className="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-400">Urutan kolom</span><button title="Geser ke kiri" className={secondaryButton} disabled={columns.findIndex((column) => column.key === selected.key) === 0} onClick={() => { const index = columns.findIndex((column) => column.key === selected.key); const next = [...columns]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; setColumns(next); setDirty(true) }}><Icon name="arrowLeft" />Kiri</button><button title="Geser ke kanan" className={secondaryButton} disabled={columns.at(-1)?.key === selected.key} onClick={() => { const index = columns.findIndex((column) => column.key === selected.key); const next = [...columns]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; setColumns(next); setDirty(true) }}>Kanan<Icon name="arrowRight" /></button></div>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-6 py-4"><button className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50" onClick={async () => { if (!(await confirm(`Hapus kolom “${selected.title}” dari template?`, { title: 'Hapus kolom?', confirmLabel: 'Hapus kolom', destructive: true }))) return; setColumns(columns.filter((column) => column.key !== selected.key)); setDirty(true); setColumnEditor(null) }}><Icon name="trash" />Hapus kolom</button><button className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800" onClick={() => setColumnEditor(null)}><Icon name="check" />Selesai</button></div>
    </div></div>}

    {rowEditor && <QuestionModal row={rowEditor} saving={saving} columns={columns} questionTitle={questionTitle} onQuestionTitleChange={(question_title_override) => setRowEditor((current) => current ? { ...current, question_title_override } : current)} onColumnTitleChange={(index, value) => setRowEditor((current) => { if (!current) return current; const column_titles = [...(current.column_titles ?? [])]; column_titles[index] = value; return { ...current, column_titles } })} onLockChange={(satker_lock_mode) => setRowEditor((current) => current ? { ...current, satker_lock_mode } : current)} onHeaderChange={(is_header) => setRowEditor((current) => current ? { ...current, is_header } : current)} onChange={(pertanyaan) => setRowEditor((current) => current ? { ...current, pertanyaan } : current)} onCancel={() => setRowEditor(null)} onSave={saveRow} />}
    {bulkRowsOpen && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 backdrop-blur-sm sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && !saving && setBulkRowsOpen(false)}><section className="my-auto flex max-h-[min(90dvh,720px)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="shrink-0 border-b border-slate-100 px-5 py-4"><h2 className="text-lg font-semibold text-slate-900">Tambah banyak baris utama</h2><p className="mt-1 text-sm text-slate-500">Tulis satu pertanyaan per baris. Setiap pertanyaan menjadi baris utama; Tambahkan jumlah baris kosong di bawah bila diperlukan.</p></header><div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5"><label className="block text-sm font-medium text-slate-700">Sisipkan setelah header<select value={bulkParentId} onChange={(event) => setBulkParentId(event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"><option value="">Tambahkan di akhir daftar</option>{rows.filter((row) => row.is_header && !row.isChild && !row.inherited).map((row) => <option key={row.id} value={row.id}>{row.pertanyaan}</option>)}</select></label><label className="block text-sm font-medium text-slate-700">Jumlah baris kosong<input type="number" min={0} max={100} value={bulkEmptyCount} onChange={(event) => setBulkEmptyCount(Math.min(100, Math.max(0, Math.floor(Number(event.target.value) || 0))))} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3" /></label><label className="block text-sm font-medium text-slate-700">Daftar pertanyaan<textarea autoFocus rows={5} value={bulkRowsText} onChange={(event) => setBulkRowsText(event.target.value)} placeholder={'Contoh:\nKebaruan inovasi\nManfaat inovasi\nDampak inovasi'} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm outline-none focus:border-violet-400 focus:ring-4 focus:ring-violet-100" /></label><p className="text-xs text-slate-500">{(bulkRowsText.split(/\r?\n/).filter((row) => row.trim()).length + bulkEmptyCount)} baris siap ditambahkan (maksimal 100).</p></div><footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3"><button disabled={saving} onClick={() => setBulkRowsOpen(false)} className={secondaryButton}>Batal</button><button disabled={saving || (!bulkRowsText.trim() && bulkEmptyCount === 0)} onClick={() => void saveBulkRows()} className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">{saving ? 'Menyimpan...' : `Tambah ${(bulkRowsText.split(/\r?\n/).filter((row) => row.trim()).length + bulkEmptyCount)} baris`}</button></footer></section></div>}
    {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Icon name="trash" className="h-5 w-5" /></div><h3 className="font-semibold text-slate-900">{tahap === 2 && deleteTarget.inherited ? 'Hapus dari Penilaian Akhir?' : 'Hapus baris ini?'}</h3><p className="mt-1 text-sm leading-6 text-slate-500">“{deleteTarget.pertanyaan}”{deleteTarget.children?.length ? ' dan semua subbarisnya' : ''} {tahap === 2 && deleteTarget.inherited ? 'tidak akan ditampilkan di BA Penilaian Akhir. BA Seleksi Awal tetap memuat baris ini.' : 'akan dihapus dari template.'}</p><div className="mt-6 flex justify-end gap-2"><button disabled={saving} className={secondaryButton} onClick={() => setDeleteTarget(null)}>Batal</button><button disabled={saving} onClick={removeRow} className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50">{saving ? 'Menghapus...' : <><Icon name="trash" />Hapus baris</>}</button></div></div></div>}
  </div>
}
