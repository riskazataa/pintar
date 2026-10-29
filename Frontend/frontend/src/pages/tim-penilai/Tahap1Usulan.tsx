import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { getUsulanList, getAkunTimPenilai, assignPenilai } from '../../services/inovasi.service'

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
  penilai?: { id: string | number; nama_lengkap: string }[] 
  penugasan?: any[]
  assigned_users?: any[]
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number
}

interface AkunPenilai {
  id: string | number
  nama_lengkap: string
  role: string
}

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Status' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Disetujui' },
  { value: 'REJECTED', label: 'Ditolak' },
  { value: 'PERBAIKAN', label: 'Perbaikan' },
]

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
  PERBAIKAN: 'bg-blue-100 text-blue-700',
  SELESAI_EVALUASI: 'bg-emerald-100 text-emerald-700',
}

// ─── Helpers ─────────────────────────────────────────
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

// Mengambil inisial nama (Budi Santoso -> BS)
function getInitials(name: string) {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.substring(0, 2).toUpperCase()
}

// Mengekstrak daftar penilai dari berbagai kemungkinan format backend
function extractPenilai(item: UsulanItem): { id: string | number, nama_lengkap: string }[] {
  if (Array.isArray(item.penilai) && item.penilai.length > 0) return item.penilai
  if (Array.isArray(item.assigned_users) && item.assigned_users.length > 0) return item.assigned_users
  if (Array.isArray(item.penugasan) && item.penugasan.length > 0) {
    // Misalnya jika formatnya item.penugasan = [{ user: { id: 1, nama_lengkap: 'Budi' } }]
    return item.penugasan.map(p => p.user || p).filter(u => u && u.nama_lengkap)
  }
  return []
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

export default function Tahap1Usulan() {
  const navigate = useNavigate()
  const user = getUser()
  const canAssign = ['SUPER_ADMIN', 'TIM_PENILAI_MARVEL'].includes(user?.role || '')

  const [data, setData] = useState<UsulanItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)

  // State Assign Modal
  const [assignTarget, setAssignTarget] = useState<UsulanItem | null>(null)
  const [assigning, setAssigning] = useState(false)
  
  // State untuk Data Master Tim Penilai & Multi-select
  const [timList, setTimList] = useState<AkunPenilai[]>([])
  const [selectedTim, setSelectedTim] = useState<AkunPenilai[]>([])

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsulanList({
        page, limit: 10, search: search || undefined,
        status: statusFilter || undefined,
        startDate: startDate || undefined, endDate: endDate || undefined,
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
  }, [page, search, statusFilter, startDate, endDate])

  useEffect(() => {
    fetchList()
    if (canAssign) {
      getAkunTimPenilai()
        .then(res => setTimList(res.data?.data || res.data || []))
        .catch(() => console.warn('Gagal memuat daftar tim penilai.'))
    }
  }, [fetchList, canAssign])

  const handleSearch = () => { setPage(1); fetchList() }

  // Multi-select Handlers
  const handleSelectTim = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value
    if (!id) return
    const userSelected = timList.find(t => String(t.id) === id)
    if (userSelected && !selectedTim.find(t => t.id === userSelected.id)) {
      setSelectedTim([...selectedTim, userSelected])
    }
  }

  const handleRemoveTim = (id: string | number) => {
    setSelectedTim(selectedTim.filter(t => t.id !== id))
  }

  const openAssignModal = (item: UsulanItem) => {
    setAssignTarget(item)
    // Jika usulan sudah punya penilai, auto-fill pilihan dropdown-nya
    const existingPenilai = extractPenilai(item)
    if (existingPenilai.length > 0) {
      // Petakan dari data yang sudah diassign ke dalam struktur AkunPenilai agar bisa dihapus/ditambah
      const mapped = existingPenilai.map(p => ({
        id: p.id,
        nama_lengkap: p.nama_lengkap,
        role: 'TIM_PENILAI_MARVEL' 
      }))
      setSelectedTim(mapped)
    } else {
      setSelectedTim([])
    }
  }

  const handleAssignSubmit = async () => {
    if (!assignTarget) return
    if (selectedTim.length === 0) return alert('Pilih minimal satu tim penilai!')

    setAssigning(true)
    try {
      // Paksa ID penilai menjadi tipe Number sebelum dikirim
      const penilaiIds = selectedTim.map(t => Number(t.id))
      
      console.log('--- FRONTEND MENGIRIM DATA ---')
      console.log('Target Inovasi ID:', assignTarget.id)
      console.log('Daftar ID Penilai:', penilaiIds)

      // Tembak API ke Backend
      await assignPenilai(assignTarget.id, penilaiIds)
      
      // Jika API sukses (status 2xx), baru update state UI secara permanen
      setData(prevData => prevData.map(item => {
        if (item.id === assignTarget.id) {
          return {
            ...item,
            penilai: selectedTim.map(tim => ({
              id: Number(tim.id),
              nama_lengkap: tim.nama_lengkap
            }))
          }
        }
        return item
      }))

      alert(`Berhasil menugaskan usulan ke ${selectedTim.length} penilai.`)
      setAssignTarget(null)
    } catch (error) {
      console.error('ERROR SAAT SAVE ASSIGN:', error)
      alert('Gagal menyimpan penugasan. Koneksi backend terputus atau format salah.')
    } finally {
      setAssigning(false)
    }
  }

  const availableTim = timList.filter(tim => !selectedTim.find(st => String(st.id) === String(tim.id)))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Daftar Usulan Inovasi</h2>
          <p className="text-sm text-gray-500">Penilaian Tahap 1 - Lihat seluruh usulan dari Satker</p>
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
            {/* Kaca Pembesar SVG Dikembalikan */}
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
                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">Belum ada usulan inovasi yang masuk</td></tr>
              ) : (
                data.map((item) => {
                  const assignedUsers = extractPenilai(item)

                  return (
                    <tr key={item.id} className="transition-colors hover:bg-blue-50/50">
                      <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{formatDate(item.createdAt || item.created_at || item.tanggal_masuk)}</td>
                      <td className="px-4 py-3.5 text-gray-600 sm:px-6 font-medium text-blue-900">{item.nama_satker || item.satker?.nama_satker || item.user?.satker?.nama_satker || '-'}</td>
                      <td className="px-4 py-3.5 text-gray-800 font-medium sm:px-6">{item.judul || item.nama_inovasi}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{item.pic_nama || item.penanggung_jawab || '-'}</td>
                      <td className="whitespace-nowrap px-4 py-3.5 sm:px-6">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status] || 'bg-gray-100 text-gray-600'}`}>{item.status}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
                        <div className="inline-flex items-center gap-1.5">
                          
                          {/* TOMBOL ASSIGN / AVATAR TIM */}
                          {canAssign && (
                            <button 
                              onClick={() => openAssignModal(item)} 
                              className="group relative flex items-center justify-center rounded-lg p-2 transition hover:bg-indigo-50" 
                              title={assignedUsers.length > 0 ? "Edit Penugasan" : "Assign Penilai"}
                            >
                              {assignedUsers.length > 0 ? (
                                // Jika sudah di-assign: Tampilkan Tumpukan Avatar
                                <div className="flex -space-x-2">
                                  {assignedUsers.slice(0, 3).map((p, idx) => (
                                    <div key={idx} className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[9px] font-bold text-indigo-700 ring-2 ring-white" title={p.nama_lengkap}>
                                      {getInitials(p.nama_lengkap)}
                                    </div>
                                  ))}
                                  {/* Jika lebih dari 3 orang */}
                                  {assignedUsers.length > 3 && (
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-[9px] font-bold text-gray-600 ring-2 ring-white">
                                      +{assignedUsers.length - 3}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                // Jika belum di-assign: Tampilkan Icon User-Plus 
                                <svg className="h-4 w-4 text-gray-400 group-hover:text-indigo-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                </svg>
                              )}
                            </button>
                          )}
                          
                          {/* TOMBOL DETAIL (Ukuran Kecil h-4 w-4) */}
                          <button onClick={() => navigate(`/tim-penilai/tahap-1/usulan/${item.id}`)} className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" title="Cek Detail">
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
        <Paginator meta={meta} onPage={(p) => setPage(p)} />
      </div>

      {/* MODAL ASSIGN AKUN (MULTI-SELECT) */}
      {assignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <h2 className="text-lg font-semibold text-gray-800">Assign Tim Penilai</h2>
              <button onClick={() => setAssignTarget(null)} className="text-gray-400 hover:bg-gray-100 p-1.5 rounded-lg transition">
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="space-y-5 py-2">
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wider font-bold mb-1">Inovasi Terpilih</p>
                <p className="text-sm font-semibold text-blue-900 bg-blue-50 p-3 rounded-lg border border-blue-100">
                  {assignTarget.judul || assignTarget.nama_inovasi}
                </p>
              </div>
              
              <div>
                <label className="block text-[11px] text-gray-400 uppercase tracking-wider font-bold mb-2">Akun Penilai <span className="text-red-500">*</span></label>
                <div className="min-h-[46px] w-full rounded-xl border border-gray-300 bg-white p-1.5 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 flex flex-wrap gap-2 items-center transition-all">
                  {selectedTim.map(tim => (
                    <span key={tim.id} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 pl-2.5 pr-1.5 py-1 text-xs font-semibold text-indigo-700 border border-indigo-100 animate-fade-in">
                      {tim.nama_lengkap}
                      <button onClick={() => handleRemoveTim(tim.id)} className="flex items-center justify-center h-4 w-4 rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-900 transition">
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                  <select onChange={handleSelectTim} value="" className="flex-1 min-w-[150px] bg-transparent text-sm text-gray-500 focus:outline-none px-2 cursor-pointer">
                    <option value="" disabled className="text-gray-400">
                      {availableTim.length === 0 && timList.length > 0 ? 'Semua penilai telah dipilih' : '+ Tambah akun penilai...'}
                    </option>
                    {availableTim.map(tim => (
                      <option key={tim.id} value={tim.id} className="text-gray-700">
                        {tim.nama_lengkap}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3 pt-5 border-t">
              <button onClick={() => setAssignTarget(null)} className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">Batal</button>
              <button onClick={handleAssignSubmit} disabled={selectedTim.length === 0 || assigning} className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
                {assigning ? 'Memproses...' : 'Simpan Penugasan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}