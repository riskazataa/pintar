import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import YearSelect from '../../components/YearSelect'
import { assignPenilaiBulk, getAkunTimPenilai, getUsulanList } from '../../services/inovasi.service'

interface Reviewer { id: number; nama_lengkap: string; role: string }
interface Proposal {
  id: number
  judul: string
  pic_nama?: string
  submitted_at?: string | null
  status: string
  status_tahap2?: string
  satker?: { nama_satker: string }
  penilai?: Reviewer[]
  penilai_tahap2?: Reviewer[]
  usulan_signatures?: { tahap: number; user_id: number }[]
}

function errorMessage(error: unknown) {
  return axios.isAxiosError(error)
    ? error.response?.data?.message || 'Terjadi kesalahan saat memproses penugasan.'
    : 'Terjadi kesalahan saat memproses penugasan.'
}

export default function PenugasanMassal() {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [stage, setStage] = useState<1 | 2>(1)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [reviewers, setReviewers] = useState<Reviewer[]>([])
  const [selectedProposals, setSelectedProposals] = useState<Set<number>>(new Set())
  const [selectedReviewers, setSelectedReviewers] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setMessage('')
    setSelectedProposals(new Set())
    Promise.all([
      getUsulanList({ tahun: Number(year), tahap: stage, limit: 0, sort_order: 'desc' }),
      getAkunTimPenilai(),
    ]).then(([proposalResponse, reviewerResponse]) => {
      if (cancelled) return
      const proposalBody = proposalResponse.data
      const reviewerBody = reviewerResponse.data
      setProposals(Array.isArray(proposalBody) ? proposalBody : proposalBody?.data ?? [])
      const accountList = Array.isArray(reviewerBody) ? reviewerBody : reviewerBody?.data ?? []
      setReviewers(accountList.filter((user: Reviewer) => user.role === 'REVIEWER'))
    }).catch((loadError: unknown) => {
      if (!cancelled) setError(errorMessage(loadError))
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [year, stage])

  const visibleProposals = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id-ID')
    if (!term) return proposals
    return proposals.filter((proposal) => [proposal.judul, proposal.satker?.nama_satker, proposal.pic_nama]
      .some((value) => value?.toLocaleLowerCase('id-ID').includes(term)))
  }, [proposals, search])

  const assignableVisible = visibleProposals.filter((proposal) =>
    !proposal.usulan_signatures?.some((signature) => signature.tahap === stage),
  )
  const selectedReviewerNames = reviewers.filter((reviewer) => selectedReviewers.has(reviewer.id)).map((reviewer) => reviewer.nama_lengkap)

  const toggleProposal = (id: number) => setSelectedProposals((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleAllVisible = () => setSelectedProposals((current) => {
    const allSelected = assignableVisible.length > 0 && assignableVisible.every((proposal) => current.has(proposal.id))
    const next = new Set(current)
    assignableVisible.forEach((proposal) => allSelected ? next.delete(proposal.id) : next.add(proposal.id))
    return next
  })

  const submitAssignment = async () => {
    setSaving(true)
    setError('')
    try {
      const result = await assignPenilaiBulk([...selectedProposals], [...selectedReviewers], stage)
      setMessage(`${result.data.updated} usulan berhasil ditugaskan ke ${selectedReviewerNames.length} penilai.`)
      setConfirmOpen(false)
      setSelectedProposals(new Set())
      const response = await getUsulanList({ tahun: Number(year), tahap: stage, limit: 0, sort_order: 'desc' })
      const body = response.data
      setProposals(Array.isArray(body) ? body : body?.data ?? [])
    } catch (saveError: unknown) {
      setError(errorMessage(saveError))
      setConfirmOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Penugasan Reviewer</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Pilih beberapa usulan sekaligus, lalu tugaskan tim reviewer yang sama dalam satu langkah.</p>
      </div>
      <YearSelect value={year} onChange={(value) => setYear(value)} />
    </header>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Tahap penilaian</h2>
          <p className="mt-1 text-sm text-slate-500">{stage === 1 ? 'Seleksi Awal' : 'Penilaian Akhir'}</p>
        </div>
        <div role="tablist" aria-label="Tahap penilaian" className="inline-flex rounded-xl bg-slate-100 p-1">
          {([1, 2] as const).map((item) => <button key={item} type="button" role="tab" aria-selected={stage === item} onClick={() => setStage(item)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${stage === item ? 'bg-teal-700 text-white shadow-sm' : 'text-slate-600 hover:bg-white'}`}>
            Tahap {item}
          </button>)}
        </div>
      </div>

      <div className="grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Cari usulan</span>
              <svg aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path strokeLinecap="round" d="m16 16 4 4"/></svg>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari judul, satker, atau PIC..." className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
            </label>
            <button type="button" disabled={!assignableVisible.length} onClick={toggleAllVisible} className="h-10 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">Pilih semua hasil</button>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500">
            <span>{visibleProposals.length} usulan ditampilkan</span>
            <span>{selectedProposals.size} usulan dipilih</span>
            <button type="button" onClick={() => setSelectedProposals(new Set())} disabled={!selectedProposals.size} className="font-semibold text-teal-700 hover:text-teal-900 disabled:opacity-40">Hapus pilihan</button>
          </div>
        </div>

        <aside className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
          <h3 className="text-sm font-semibold text-slate-800">Pilih penilai</h3>
          <p className="mb-3 mt-1 text-xs leading-5 text-slate-500">Semua penilai terpilih akan ditugaskan ke setiap usulan yang dipilih.</p>
          <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
            {reviewers.map((reviewer) => <label key={reviewer.id} className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-white">
              <input type="checkbox" checked={selectedReviewers.has(reviewer.id)} onChange={() => setSelectedReviewers((current) => {
                const next = new Set(current)
                if (next.has(reviewer.id)) next.delete(reviewer.id)
                else next.add(reviewer.id)
                return next
              })} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600" />
              <span>{reviewer.nama_lengkap}</span>
            </label>)}
            {!reviewers.length && <p className="py-3 text-xs text-slate-500">Belum ada akun reviewer aktif.</p>}
          </div>
          <button type="button" disabled={saving || !selectedProposals.size || !selectedReviewers.size} onClick={() => setConfirmOpen(true)} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-40">
            Tugaskan {selectedProposals.size || ''} usulan
          </button>
        </aside>
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {message && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="max-h-[55vh] overflow-auto">
          <table className="w-full min-w-[780px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 border-b border-slate-200 px-3 py-3 text-center"><input aria-label="Pilih semua usulan yang dapat ditugaskan" type="checkbox" checked={assignableVisible.length > 0 && assignableVisible.every((proposal) => selectedProposals.has(proposal.id))} onChange={toggleAllVisible} className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600" /></th>
                <th className="w-14 border-b border-slate-200 px-3 py-3 text-center">No</th>
                <th className="border-b border-slate-200 px-4 py-3">Usulan / Satker</th>
                <th className="border-b border-slate-200 px-4 py-3">Status Tahap {stage}</th>
                <th className="border-b border-slate-200 px-4 py-3">Penilai saat ini</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Memuat usulan...</td></tr> : visibleProposals.length === 0 ? <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">Tidak ada usulan untuk filter ini.</td></tr> : visibleProposals.map((proposal, index) => {
                const assigned = stage === 1 ? proposal.penilai ?? [] : proposal.penilai_tahap2 ?? proposal.penilai ?? []
                const signed = proposal.usulan_signatures?.some((signature) => signature.tahap === stage) ?? false
                const status = stage === 1 ? proposal.status : proposal.status_tahap2 ?? proposal.status
                return <tr key={proposal.id} className={`transition hover:bg-teal-50/40 ${selectedProposals.has(proposal.id) ? 'bg-teal-50/70' : ''}`}>
                  <td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`Pilih ${proposal.judul}`} checked={selectedProposals.has(proposal.id)} disabled={signed} title={signed ? 'Usulan sudah memiliki tanda tangan pada tahap ini' : undefined} onChange={() => toggleProposal(proposal.id)} className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-30" /></td>
                  <td className="px-3 py-3 text-center tabular-nums text-slate-400">{index + 1}</td>
                  <td className="px-4 py-3"><p className="font-medium text-slate-800">{proposal.judul}</p><p className="mt-1 text-xs text-slate-500">{proposal.satker?.nama_satker ?? 'Satker tidak diketahui'}{proposal.pic_nama ? ` · ${proposal.pic_nama}` : ''}</p></td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === 'PERBAIKAN' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{status?.replaceAll('_', ' ') ?? 'PENDING'}</span>{signed && <p className="mt-1 text-xs text-amber-700">Terkunci: sudah tanda tangan</p>}</td>
                  <td className="max-w-xs px-4 py-3 text-xs leading-5 text-slate-600">{assigned.length ? assigned.map((reviewer) => reviewer.nama_lengkap).join(', ') : <span className="text-slate-400">Belum ditugaskan</span>}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    {confirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setConfirmOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="bulk-assignment-title" className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700"><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4 3v6m3-3h-6" /></svg></div>
        <h2 id="bulk-assignment-title" className="text-lg font-semibold text-slate-900">Konfirmasi penugasan reviewer</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{selectedProposals.size} usulan akan ditugaskan kepada {selectedReviewerNames.join(', ')} untuk Tahap {stage}.</p>
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Penugasan reviewer yang ada pada usulan terpilih akan diganti dengan reviewer di atas. Usulan yang sudah ditandatangani tidak dapat dipilih.</p>
        <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={saving} onClick={() => setConfirmOpen(false)} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Batal</button><button type="button" disabled={saving} onClick={submitAssignment} className="h-10 rounded-lg bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50">{saving ? 'Menyimpan...' : 'Ya, tugaskan'}</button></div>
      </section>
    </div>}
  </div>
}
