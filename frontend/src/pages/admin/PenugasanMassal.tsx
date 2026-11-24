import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import YearSelect from '../../components/YearSelect'
import { assignPenilaiBulk, assignPenilaiBySatkerBulk, getAkunTimPenilai, getUsulanList, removePenilaiBulk } from '../../services/inovasi.service'

interface Reviewer { id: number; nama_lengkap: string; role: string }
interface Proposal {
  id: number
  judul: string
  pic_nama?: string
  submitted_at?: string | null
  status: string
  status_tahap2?: string
  satker_id?: number
  satker?: { id?: number; nama_satker: string }
  penilai?: Reviewer[]
  penilai_tahap2?: Reviewer[]
  usulan_signatures?: { tahap: number; user_id: number }[]
}

type AssignmentMode = 'INOVASI' | 'SATKER'
type BulkAction = 'ASSIGN' | 'REMOVE'
type SatkerGroup = { id: number; nama: string; proposals: Proposal[] }

function proposalSatkerId(proposal: Proposal) {
  const id = Number(proposal.satker_id ?? proposal.satker?.id)
  return Number.isInteger(id) && id > 0 ? id : null
}

function isSignedForStage(proposal: Proposal, stage: 1 | 2) {
  return proposal.usulan_signatures?.some((signature) => signature.tahap === stage) ?? false
}

function reviewersForStage(proposal: Proposal, stage: 1 | 2) {
  return stage === 1 ? proposal.penilai ?? [] : proposal.penilai_tahap2 ?? []
}

function reviewerHasSigned(proposal: Proposal, stage: 1 | 2, reviewerId: number) {
  return proposal.usulan_signatures?.some((signature) => signature.tahap === stage && signature.user_id === reviewerId) ?? false
}

function hasUnsignedAssignment(proposal: Proposal, stage: 1 | 2) {
  return reviewersForStage(proposal, stage).some((reviewer) => !reviewerHasSigned(proposal, stage, reviewer.id))
}

function hasSelectedUnsignedAssignment(proposal: Proposal, stage: 1 | 2, reviewerIds: Set<number>) {
  return reviewersForStage(proposal, stage).some((reviewer) => reviewerIds.has(reviewer.id) && !reviewerHasSigned(proposal, stage, reviewer.id))
}

function errorMessage(error: unknown) {
  return axios.isAxiosError(error)
    ? error.response?.data?.message || 'Terjadi kesalahan saat memproses penugasan.'
    : 'Terjadi kesalahan saat memproses penugasan.'
}

export default function PenugasanMassal() {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [stage, setStage] = useState<1 | 2>(1)
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('INOVASI')
  const [bulkAction, setBulkAction] = useState<BulkAction>('ASSIGN')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [reviewers, setReviewers] = useState<Reviewer[]>([])
  const [selectedProposals, setSelectedProposals] = useState<Set<number>>(new Set())
  const [selectedSatkers, setSelectedSatkers] = useState<Set<number>>(new Set())
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
    setSelectedSatkers(new Set())
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

  const visibleSatkers = useMemo(() => {
    const grouped = new Map<number, SatkerGroup>()
    for (const proposal of proposals) {
      const id = proposalSatkerId(proposal)
      if (id === null) continue
      const existing = grouped.get(id)
      if (existing) existing.proposals.push(proposal)
      else grouped.set(id, { id, nama: proposal.satker?.nama_satker ?? 'Satker tidak diketahui', proposals: [proposal] })
    }
    const term = search.trim().toLocaleLowerCase('id-ID')
    return [...grouped.values()]
      .filter((satker) => !term || satker.nama.toLocaleLowerCase('id-ID').includes(term))
      .sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
  }, [proposals, search])

  const selectableVisible = visibleProposals.filter((proposal) => bulkAction === 'ASSIGN'
    ? !isSignedForStage(proposal, stage)
    : hasUnsignedAssignment(proposal, stage))
  const selectableVisibleSatkers = visibleSatkers.filter((satker) => satker.proposals.some((proposal) => bulkAction === 'ASSIGN'
    ? !isSignedForStage(proposal, stage)
    : hasUnsignedAssignment(proposal, stage)))
  const selectedProposalIdsForAction = proposals
    .filter((proposal) => selectedProposals.has(proposal.id) && (bulkAction === 'ASSIGN'
      ? !isSignedForStage(proposal, stage)
      : hasSelectedUnsignedAssignment(proposal, stage, selectedReviewers)))
    .map((proposal) => proposal.id)
  const selectedSatkerProposalIds = proposals
    .filter((proposal) => {
      const id = proposalSatkerId(proposal)
      if (id === null || !selectedSatkers.has(id)) return false
      return bulkAction === 'ASSIGN'
        ? !isSignedForStage(proposal, stage)
        : hasSelectedUnsignedAssignment(proposal, stage, selectedReviewers)
    })
    .map((proposal) => proposal.id)
  const selectedReviewerNames = reviewers.filter((reviewer) => selectedReviewers.has(reviewer.id)).map((reviewer) => reviewer.nama_lengkap)

  const toggleProposal = (id: number) => setSelectedProposals((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleAllVisible = () => setSelectedProposals((current) => {
    const allSelected = selectableVisible.length > 0 && selectableVisible.every((proposal) => current.has(proposal.id))
    const next = new Set(current)
    selectableVisible.forEach((proposal) => allSelected ? next.delete(proposal.id) : next.add(proposal.id))
    return next
  })

  const toggleSatker = (id: number) => setSelectedSatkers((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const toggleAllVisibleSatkers = () => setSelectedSatkers((current) => {
    const allSelected = selectableVisibleSatkers.length > 0 && selectableVisibleSatkers.every((satker) => current.has(satker.id))
    const next = new Set(current)
    selectableVisibleSatkers.forEach((satker) => allSelected ? next.delete(satker.id) : next.add(satker.id))
    return next
  })

  const changeAssignmentMode = (mode: AssignmentMode) => {
    setAssignmentMode(mode)
    setSelectedProposals(new Set())
    setSelectedSatkers(new Set())
    setSearch('')
  }

  const changeBulkAction = (action: BulkAction) => {
    setBulkAction(action)
    setSelectedProposals((current) => new Set([...current].filter((id) => {
      const proposal = proposals.find((candidate) => candidate.id === id)
      return proposal && (action === 'ASSIGN' ? !isSignedForStage(proposal, stage) : hasUnsignedAssignment(proposal, stage))
    })))
    setSelectedSatkers((current) => new Set([...current].filter((id) => {
      const satker = visibleSatkers.find((candidate) => candidate.id === id)
      return satker?.proposals.some((proposal) => action === 'ASSIGN' ? !isSignedForStage(proposal, stage) : hasUnsignedAssignment(proposal, stage))
    })))
  }

  const submitAssignment = async () => {
    setSaving(true)
    setError('')
    try {
      const proposalIds = assignmentMode === 'SATKER' ? selectedSatkerProposalIds : selectedProposalIdsForAction
      const result = bulkAction === 'REMOVE'
        ? await removePenilaiBulk(proposalIds, [...selectedReviewers], stage)
        : assignmentMode === 'SATKER'
          ? await assignPenilaiBySatkerBulk([...selectedSatkers], [...selectedReviewers], Number(year), stage)
            : await assignPenilaiBulk(selectedProposalIdsForAction, [...selectedReviewers], stage)
      const updated = Number(result.data?.updated ?? 0)
      const skippedSigned = Number(result.data?.skipped_signed ?? 0)
      const assignedMessage = assignmentMode === 'SATKER'
        ? `${updated} usulan dari ${selectedSatkers.size} Satker berhasil ditugaskan ke ${selectedReviewerNames.length} penilai.`
        : `${updated} usulan berhasil ditugaskan ke ${selectedReviewerNames.length} penilai.`
      const actionMessage = bulkAction === 'REMOVE'
        ? `${Number(result.data?.removed ?? 0)} penugasan reviewer berhasil dihapus; ${updated} usulan diperbarui.`
        : assignedMessage
      const skippedMessage = bulkAction === 'REMOVE'
        ? skippedSigned ? ` ${skippedSigned} penugasan dipertahankan karena reviewer sudah TTD.` : ''
        : skippedSigned ? ` ${skippedSigned} usulan dilewati karena sudah ditandatangani.` : ''
      setMessage(`${actionMessage}${skippedMessage}`)
      setConfirmOpen(false)
      setSelectedProposals(new Set())
      setSelectedSatkers(new Set())
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

  const selectedTargetCount = assignmentMode === 'SATKER' ? selectedSatkerProposalIds.length : selectedProposalIdsForAction.length
  const canSelectAll = assignmentMode === 'SATKER' ? selectableVisibleSatkers.length > 0 : selectableVisible.length > 0
  const tooManyTargets = selectedTargetCount > 200 && (bulkAction === 'REMOVE' || assignmentMode === 'INOVASI')

  return <div className="space-y-5">
    <header className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-gradient-to-r from-white via-white to-teal-50/70 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white shadow-sm shadow-teal-900/15">
          <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4 3v6m3-3h-6" /></svg>
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Penugasan Reviewer</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">Pilih inovasi atau Satker, lalu tugaskan reviewer dalam satu langkah.</p>
        </div>
      </div>
      <div className="rounded-xl border border-white bg-white/80 p-3 shadow-sm">
        <YearSelect value={year} onChange={(value) => setYear(value)} />
      </div>
    </header>

    <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">1. Tahap penilaian</p>
        <div role="tablist" aria-label="Tahap penilaian" className="grid grid-cols-2 gap-2">
          {([{ value: 1, title: 'Tahap 1', detail: 'Seleksi Awal' }, { value: 2, title: 'Tahap 2', detail: 'Penilaian Akhir' }] as const).map((item) => <button key={item.value} type="button" role="tab" aria-selected={stage === item.value} onClick={() => setStage(item.value)} className={`rounded-xl border px-3.5 py-3 text-left transition ${stage === item.value ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
            <span className={`block text-sm font-semibold ${stage === item.value ? 'text-teal-900' : 'text-slate-700'}`}>{item.title}</span>
            <span className="mt-0.5 block text-xs text-slate-500">{item.detail}</span>
          </button>)}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">2. Dasar penugasan</p>
        <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Dasar penugasan reviewer">
          {([
            { value: 'INOVASI', title: 'Per Inovasi', detail: 'Pilih usulan satu per satu.', icon: '◇' },
            { value: 'SATKER', title: 'Per Satker', detail: bulkAction === 'REMOVE' ? 'Hapus reviewer dari usulan satu Satker.' : 'Tugaskan seluruh usulan satu Satker.', icon: '▦' },
          ] as const).map((option) => <button key={option.value} type="button" aria-pressed={assignmentMode === option.value} onClick={() => changeAssignmentMode(option.value)} className={`flex min-h-[72px] items-center gap-3 rounded-xl border p-3 text-left transition ${assignmentMode === option.value ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-lg ${assignmentMode === option.value ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-500'}`}>{option.icon}</span>
            <span className="min-w-0"><span className={`block text-sm font-semibold ${assignmentMode === option.value ? 'text-teal-900' : 'text-slate-700'}`}>{option.title}</span><span className="mt-0.5 block text-xs leading-4 text-slate-500">{option.detail}</span></span>
          </button>)}
        </div>
      </div>
    </section>

    {error && <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"><svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/></svg><span>{error}</span></div>}
    {message && <div role="status" className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><svg aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6"/></svg><span>{message}</span></div>}

    <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-sm font-bold text-blue-700">1</span>
            <div><h2 className="font-semibold text-slate-900">{assignmentMode === 'SATKER' ? 'Pilih Satker' : 'Pilih usulan'}</h2><p className="mt-0.5 text-xs text-slate-500">{assignmentMode === 'SATKER'
              ? bulkAction === 'REMOVE' ? 'Pilih Satker untuk menghapus reviewer dari usulan yang belum ditandatangani reviewer tersebut.' : 'Semua usulan yang belum ditandatangani di Satker terpilih akan ditugaskan.'
              : bulkAction === 'REMOVE' ? 'Pilih beberapa inovasi untuk menghapus reviewer yang dipilih.' : 'Pilih satu atau beberapa inovasi yang akan ditugaskan.'}</p></div>
          </div>
          <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{assignmentMode === 'SATKER' ? `${visibleSatkers.length} Satker` : `${visibleProposals.length} usulan`}</span>
        </div>

        <div className="space-y-3 border-b border-slate-100 bg-slate-50/60 px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">{assignmentMode === 'SATKER' ? 'Cari Satker' : 'Cari usulan'}</span>
              <svg aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path strokeLinecap="round" d="m16 16 4 4"/></svg>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={assignmentMode === 'SATKER' ? 'Cari nama Satker...' : 'Cari judul, satker, atau PIC...'} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-100" />
            </label>
            <button type="button" disabled={!canSelectAll} onClick={assignmentMode === 'SATKER' ? toggleAllVisibleSatkers : toggleAllVisible} className="h-10 shrink-0 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-40">Pilih semua {assignmentMode === 'SATKER' ? 'Satker' : 'hasil'}</button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <p className="text-slate-600">{assignmentMode === 'SATKER'
              ? <><span className="font-semibold text-slate-800">{selectedSatkers.size} Satker</span> dipilih · <span className="font-semibold text-teal-800">{selectedSatkerProposalIds.length} usulan</span> {bulkAction === 'REMOVE' ? 'akan dihapus penugasannya' : 'akan ditugaskan'}</>
              : <><span className="font-semibold text-slate-800">{selectedTargetCount} usulan</span> dipilih</>}</p>
            {(assignmentMode === 'SATKER' ? selectedSatkers.size > 0 : selectedProposals.size > 0) && <button type="button" onClick={() => assignmentMode === 'SATKER' ? setSelectedSatkers(new Set()) : setSelectedProposals(new Set())} className="font-semibold text-teal-700 hover:text-teal-900">Hapus pilihan</button>}
          </div>
        </div>

        <div className="max-h-[62vh] overflow-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-11 border-b border-slate-200 px-3 py-3 text-center"><span className="sr-only">Pilih</span></th>
                <th className="w-12 border-b border-slate-200 px-2 py-3 text-center">No</th>
                <th className="border-b border-slate-200 px-4 py-3">{assignmentMode === 'SATKER' ? 'Satker' : 'Inovasi / Satker'}</th>
                <th className="border-b border-slate-200 px-4 py-3">{assignmentMode === 'SATKER' ? 'Dapat ditugaskan' : `Status Tahap ${stage}`}</th>
                <th className="border-b border-slate-200 px-4 py-3">{assignmentMode === 'SATKER' ? 'Penugasan saat ini' : 'Reviewer saat ini'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={5} className="px-4 py-14 text-center"><span className="inline-flex items-center gap-2 text-sm text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-teal-600" />Memuat data penugasan...</span></td></tr>
                : assignmentMode === 'SATKER' ? visibleSatkers.length === 0 ? <tr><td colSpan={5} className="px-4 py-14 text-center"><p className="font-medium text-slate-700">Satker tidak ditemukan</p><p className="mt-1 text-xs text-slate-500">Coba ubah kata pencarian atau tahun pengajuan.</p></td></tr> : visibleSatkers.map((satker, index) => {
                  const eligibleProposals = satker.proposals.filter((proposal) => bulkAction === 'ASSIGN'
                    ? !isSignedForStage(proposal, stage)
                    : hasUnsignedAssignment(proposal, stage))
                  const signedCount = satker.proposals.length - eligibleProposals.length
                  const assignedCount = eligibleProposals.filter((proposal) => (stage === 1 ? proposal.penilai : proposal.penilai_tahap2 ?? proposal.penilai)?.length).length
                  const reviewerNames = [...new Set(eligibleProposals.flatMap((proposal) => (stage === 1 ? proposal.penilai : proposal.penilai_tahap2 ?? proposal.penilai)?.map((reviewer) => reviewer.nama_lengkap) ?? []))]
                  const selected = selectedSatkers.has(satker.id)
                  return <tr key={satker.id} className={`transition-colors ${eligibleProposals.length ? 'hover:bg-teal-50/40' : 'bg-slate-50/60'} ${selected ? 'bg-teal-50/70' : ''}`}>
                    <td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`Pilih semua usulan dari ${satker.nama}`} checked={selected} disabled={!eligibleProposals.length} title={!eligibleProposals.length ? bulkAction === 'REMOVE' ? 'Tidak ada penugasan yang dapat dihapus pada tahap ini' : 'Semua usulan sudah memiliki tanda tangan pada tahap ini' : undefined} onChange={() => toggleSatker(satker.id)} className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-30" /></td>
                    <td className="px-2 py-3 text-center tabular-nums text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3"><p className="font-medium text-slate-800">{satker.nama}</p><p className="mt-1 text-xs text-slate-500">{satker.proposals.length} usulan{signedCount ? ` · ${signedCount} sudah ditandatangani` : ''}</p></td>
                    <td className="px-4 py-3"><span className={`inline-flex min-w-8 justify-center rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ${eligibleProposals.length ? 'bg-teal-50 text-teal-800' : 'bg-slate-100 text-slate-500'}`}>{eligibleProposals.length}</span><span className="ml-2 text-xs text-slate-500">usulan</span></td>
                    <td className="max-w-xs px-4 py-3 text-xs leading-5 text-slate-600"><span>{assignedCount} dari {eligibleProposals.length} sudah ditugaskan</span>{reviewerNames.length > 0 && <p className="mt-1 text-slate-500">{reviewerNames.slice(0, 3).join(', ')}{reviewerNames.length > 3 ? ` +${reviewerNames.length - 3} lainnya` : ''}</p>}</td>
                  </tr>
                }) : visibleProposals.length === 0 ? <tr><td colSpan={5} className="px-4 py-14 text-center"><p className="font-medium text-slate-700">Usulan tidak ditemukan</p><p className="mt-1 text-xs text-slate-500">Coba ubah kata pencarian atau tahun pengajuan.</p></td></tr> : visibleProposals.map((proposal, index) => {
                  const assigned = stage === 1 ? proposal.penilai ?? [] : proposal.penilai_tahap2 ?? proposal.penilai ?? []
                  const signed = isSignedForStage(proposal, stage)
                  const selectionBlocked = bulkAction === 'ASSIGN' ? signed : !hasUnsignedAssignment(proposal, stage)
                  const status = stage === 1 ? proposal.status : proposal.status_tahap2 ?? proposal.status
                  return <tr key={proposal.id} className={`transition-colors ${signed ? 'bg-slate-50/60' : 'hover:bg-teal-50/40'} ${selectedProposals.has(proposal.id) ? 'bg-teal-50/70' : ''}`}>
                    <td className="px-3 py-3 text-center"><input type="checkbox" aria-label={`Pilih ${proposal.judul}`} checked={selectedProposals.has(proposal.id)} disabled={selectionBlocked} title={selectionBlocked ? bulkAction === 'REMOVE' ? 'Tidak ada penugasan yang dapat dihapus pada tahap ini' : 'Usulan sudah memiliki tanda tangan pada tahap ini' : undefined} onChange={() => toggleProposal(proposal.id)} className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600 disabled:cursor-not-allowed disabled:opacity-30" /></td>
                    <td className="px-2 py-3 text-center tabular-nums text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3"><p className="font-medium text-slate-800">{proposal.judul}</p><p className="mt-1 text-xs text-slate-500">{proposal.satker?.nama_satker ?? 'Satker tidak diketahui'}{proposal.pic_nama ? ` · ${proposal.pic_nama}` : ''}</p></td>
                    <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === 'PERBAIKAN' ? 'bg-amber-100 text-amber-800' : signed ? 'bg-slate-200 text-slate-600' : 'bg-blue-50 text-blue-700'}`}>{status?.replaceAll('_', ' ') ?? 'PENDING'}</span>{signed && <p className="mt-1 text-xs text-slate-500">Terkunci: sudah tanda tangan</p>}</td>
                    <td className="max-w-xs px-4 py-3 text-xs leading-5 text-slate-600">{assigned.length ? assigned.map((reviewer) => reviewer.nama_lengkap).join(', ') : <span className="text-slate-400">Belum ditugaskan</span>}</td>
                  </tr>
                })}
            </tbody>
          </table>
        </div>
        {!loading && <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">{assignmentMode === 'SATKER' ? `${visibleSatkers.length} Satker ditampilkan` : `${visibleProposals.length} usulan ditampilkan`} untuk tahun {year} · Tahap {stage}</div>}
      </div>

      <aside className="xl:sticky xl:top-5">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 bg-gradient-to-r from-teal-50 to-white px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-sm font-bold text-white">2</span><div><h2 className="font-semibold text-slate-900">Pilih reviewer</h2><p className="mt-0.5 text-xs text-slate-500">Pilih satu atau beberapa penilai.</p></div></div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{selectedReviewers.size} dipilih</span>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-2 border-b border-slate-100 p-3" role="group" aria-label="Aksi penugasan reviewer">
            <button type="button" aria-pressed={bulkAction === 'ASSIGN'} onClick={() => changeBulkAction('ASSIGN')} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${bulkAction === 'ASSIGN' ? 'border-teal-700 bg-teal-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>Tugaskan</button>
            <button type="button" aria-pressed={bulkAction === 'REMOVE'} onClick={() => changeBulkAction('REMOVE')} className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${bulkAction === 'REMOVE' ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700'}`}>Hapus penugasan</button>
          </div>

          <div className="max-h-[42vh] space-y-1 overflow-y-auto p-3 sm:p-4 xl:max-h-[55vh]">
            {reviewers.map((reviewer) => {
              const selected = selectedReviewers.has(reviewer.id)
              return <label key={reviewer.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition ${selected ? 'border-teal-200 bg-teal-50' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
                <input type="checkbox" checked={selected} onChange={() => setSelectedReviewers((current) => {
                  const next = new Set(current)
                  if (next.has(reviewer.id)) next.delete(reviewer.id)
                  else next.add(reviewer.id)
                  return next
                })} className="h-4 w-4 shrink-0 rounded border-slate-300 text-teal-700 focus:ring-teal-600" />
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${selected ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{reviewer.nama_lengkap.trim().charAt(0).toLocaleUpperCase('id-ID')}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">{reviewer.nama_lengkap}</span>
                {selected && <svg aria-hidden="true" className="h-4 w-4 shrink-0 text-teal-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6"/></svg>}
              </label>
            })}
            {!reviewers.length && <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center"><p className="text-sm font-medium text-slate-700">Belum ada reviewer</p><p className="mt-1 text-xs text-slate-500">Akun reviewer aktif akan muncul di sini.</p></div>}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 p-4">
            <p className="mb-3 text-xs leading-5 text-slate-500">{bulkAction === 'REMOVE'
              ? 'Akun reviewer yang dipilih akan dihapus dari usulan terpilih. Penilai lain tetap ditugaskan; reviewer yang sudah TTD dipertahankan.'
              : `Reviewer terpilih akan diterapkan ke ${assignmentMode === 'SATKER' ? 'semua usulan yang dapat ditugaskan di Satker terpilih' : 'setiap inovasi yang dipilih'}.`}</p>
            <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><span className="text-slate-500">Target usulan</span><span className="font-semibold text-slate-800">{selectedTargetCount}</span></div>
            {tooManyTargets && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">Maksimal 200 usulan dapat diproses dalam satu kali aksi. Kurangi pilihan usulan.</p>}
            <button type="button" disabled={saving || !selectedTargetCount || !selectedReviewers.size || tooManyTargets} onClick={() => setConfirmOpen(true)} className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-40 ${bulkAction === 'REMOVE' ? 'bg-rose-600 shadow-rose-900/10 hover:bg-rose-700 focus-visible:ring-rose-100' : 'bg-teal-700 shadow-teal-900/10 hover:bg-teal-800 focus-visible:ring-teal-100'}`}>
              {bulkAction === 'REMOVE'
                ? <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></svg>
                : <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4 3v6m3-3h-6"/></svg>}
              {saving ? 'Memproses...' : bulkAction === 'REMOVE' ? `Hapus penugasan (${selectedTargetCount})` : assignmentMode === 'SATKER' ? `Tugaskan ke ${selectedSatkers.size} Satker` : `Tugaskan ${selectedTargetCount} usulan`}
            </button>
          </div>
        </section>
      </aside>
    </section>

    {confirmOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setConfirmOpen(false) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="bulk-assignment-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/70 bg-white shadow-2xl shadow-slate-950/20">
        <div className="p-5 sm:p-6">
          <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${bulkAction === 'REMOVE' ? 'bg-rose-50 text-rose-700' : 'bg-teal-50 text-teal-700'}`}>
            {bulkAction === 'REMOVE' ? <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3"/></svg> : <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4 3v6m3-3h-6" /></svg>}
          </div>
          <h2 id="bulk-assignment-title" className="text-lg font-semibold text-slate-900">{bulkAction === 'REMOVE' ? 'Konfirmasi hapus penugasan' : 'Konfirmasi penugasan reviewer'}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{bulkAction === 'REMOVE'
            ? `${selectedReviewerNames.join(', ')} akan dihapus dari ${selectedTargetCount} usulan untuk Tahap ${stage}. Penilai lain pada usulan tetap dipertahankan.`
            : assignmentMode === 'SATKER'
              ? `${selectedSatkers.size} Satker dipilih (${selectedSatkerProposalIds.length} usulan yang belum ditandatangani) akan ditugaskan kepada ${selectedReviewerNames.join(', ')} untuk Tahap ${stage}.`
              : `${selectedTargetCount} usulan akan ditugaskan kepada ${selectedReviewerNames.join(', ')} untuk Tahap ${stage}.`}</p>
          <p className={`mt-4 rounded-xl border px-3.5 py-3 text-xs leading-5 ${bulkAction === 'REMOVE' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{bulkAction === 'REMOVE'
            ? 'Penugasan reviewer yang sudah tanda tangan tidak akan dihapus. Penugasan reviewer lain tidak berubah.'
            : 'Penilai yang sudah ada pada target terpilih akan diganti. Usulan yang sudah ditandatangani tidak akan diubah.'}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-6">
          <button type="button" disabled={saving} onClick={() => setConfirmOpen(false)} className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Batal</button>
          <button type="button" disabled={saving} onClick={submitAssignment} className={`h-10 rounded-lg px-4 text-sm font-semibold text-white transition disabled:opacity-50 ${bulkAction === 'REMOVE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-teal-700 hover:bg-teal-800'}`}>{saving ? 'Memproses...' : bulkAction === 'REMOVE' ? 'Ya, hapus penugasan' : 'Ya, tugaskan'}</button>
        </div>
      </section>
    </div>}
  </div>
}
