import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import {
  getAssessmentQuestions,
  createAssessmentQuestion,
  updateAssessmentQuestion,
  deleteAssessmentQuestion,
} from '../../services/inovasi.service'

interface Question {
  id: string | number
  pertanyaan: string
  parent_id?: string | number | null
}

const EMPTY_FORM = { pertanyaan: '', parent_id: null as string | number | null }

export default function ManagementBA() {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Question | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null)
  const [deleting, setDeleting] = useState(false)

 const fetchQuestions = useCallback(async () => {
  setLoading(true)
  try {
    const res = await getAssessmentQuestions()
    // Langsung simpan data tree (bersarang) dari backend ke state
    const rawData = Array.isArray(res.data) ? res.data : res.data.data ?? []
    setQuestions(rawData)
  } catch (err) {
    // handle error...
  } finally {
    setLoading(false)
  }
}, [])

  useEffect(() => { fetchQuestions() }, [fetchQuestions, refreshKey])

  const openCreateParent = () => {
    setEditing(null)
    setForm({ pertanyaan: '', parent_id: null })
    setModalOpen(true)
  }

  const openCreateChild = (parentId: string | number) => {
    setEditing(null)
    setForm({ pertanyaan: '', parent_id: parentId })
    setModalOpen(true)
  }

  const openEdit = (q: Question) => {
    setEditing(q)
    setForm({ pertanyaan: q.pertanyaan || '', parent_id: q.parent_id || null })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.pertanyaan?.trim()) return
    setSaving(true)
    try {
      const payload = { ...form }
      if (editing && editing.id) {
        await updateAssessmentQuestion(editing.id as string, payload)
      } else {
        await createAssessmentQuestion(payload as any)
      }
      setModalOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      alert(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan' : 'Terjadi kesalahan')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !deleteTarget.id) return
    setDeleting(true)
    try {
      await deleteAssessmentQuestion(deleteTarget.id as string)
      setDeleteTarget(null)
      setRefreshKey((k) => k + 1)
    } catch (err: unknown) {
      alert(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menghapus' : 'Terjadi kesalahan')
    } finally {
      setDeleting(false)
    }
  }

  const parents = questions.filter((q) => !q.parent_id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Management BA Inovasi</h2>
          <p className="text-sm text-gray-500">Kelola hierarki pertanyaan self assessment</p>
        </div>
        <button
          onClick={openCreateParent}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Tambah Pertanyaan Utama
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Content */}
      {loading ? (
        <div className="animate-pulse space-y-6 rounded-xl bg-white p-6 shadow-sm">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3"><div className="h-10 rounded bg-gray-200" /></div>
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-20 text-center">
          <svg className="mb-4 h-16 w-16 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <h3 className="text-base font-semibold text-gray-600">Belum Ada Pertanyaan</h3>
        </div>
      ) : (
     
<div className="space-y-4">
  {questions.map((parent: any, pIdx: number) => (
    <div key={parent.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      
      {/* --- BARIS PERTANYAAN UTAMA (PARENT) --- */}
      <div className="flex items-center justify-between bg-gray-50/80 px-6 py-4">
        <div className="flex items-start gap-3">
          <span className="font-bold text-gray-800">{pIdx + 1}.</span>
          <span className="font-bold text-gray-800">{parent.pertanyaan}</span>
        </div>
        
       {/* Tombol Aksi Parent (Edit/Hapus/Tambah Anak) */}
<div className="flex items-center gap-1 shrink-0 ml-4">
  <button 
    onClick={() => openCreateChild(parent.id)} 
    className="rounded-lg p-2 text-violet-600 transition hover:bg-violet-100" 
    title="Tambah Sub-Pertanyaan"
  >
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  </button>
  <button 
    onClick={() => openEdit(parent)} 
    className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" 
    title="Edit"
  >
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  </button>
  <button 
    onClick={() => setDeleteTarget(parent)} 
    className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600" 
    title="Hapus"
  >
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  </button>
</div>
      </div>

      {/* --- BARIS ANAK PERTANYAAN (CHILDREN) --- */}
      {/* Mengecek apakah parent memiliki array children dan isinya lebih dari 0 */}
      {parent.children && parent.children.length > 0 && (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {parent.children.map((child: any, cIdx: number) => (
            <div key={child.id} className="flex items-center justify-between px-6 py-3 pl-14 hover:bg-gray-50 transition">
              <div className="flex items-start gap-3">
                {/* Penomoran abjad otomatis: a, b, c */}
                <span className="font-medium text-gray-500">{String.fromCharCode(97 + cIdx)}.</span>
                <span className="text-gray-600">{child.pertanyaan}</span>
              </div>
              
  {/* Tombol Aksi Child (Edit/Hapus) */}
<div className="flex items-center gap-1 shrink-0 ml-4">
  <button 
    onClick={() => openEdit(child)} 
    className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" 
    title="Edit"
  >
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  </button>
  <button 
    onClick={() => setDeleteTarget(child)} 
    className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600" 
    title="Hapus"
  >
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  </button>
</div>
            </div>
          ))}
        </div>
      )}

    </div>
  ))}
</div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {editing ? 'Edit Pertanyaan' : (form.parent_id ? 'Tambah Sub-Pertanyaan' : 'Tambah Pertanyaan Utama')}
              </h2>
              <button onClick={() => setModalOpen(false)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Pertanyaan <span className="text-red-500">*</span></label>
                <textarea
                  value={form.pertanyaan}
                  onChange={(e) => setForm((prev) => ({ ...prev, pertanyaan: e.target.value }))}
                  placeholder="Masukkan isi pertanyaan"
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
                  autoFocus
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setModalOpen(false)} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Batal</button>
              <button onClick={handleSave} disabled={saving || !form.pertanyaan?.trim()} className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-60">
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-gray-800">Hapus Pertanyaan</h2>
            <p className="mb-2 text-sm text-gray-500">Yakin ingin menghapus pertanyaan ini?</p>
            {!deleteTarget.parent_id && questions.some((q) => q.parent_id === deleteTarget.id) && (
              <p className="mb-6 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Pertanyaan ini memiliki sub-pertanyaan. Sub-pertanyaan juga otomatis akan terhapus.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Batal</button>
              <button onClick={handleDelete} disabled={deleting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60">
                {deleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}