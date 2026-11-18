import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { useNotifications } from '../../components/NotificationProvider'
import YearSelect from '../../components/YearSelect'
import { getUsulanList, kembalikanUsulanMassal } from '../../services/inovasi.service'

interface Proposal {
  id: number
  judul: string
  status: string
  created_at?: string
  submitted_at?: string | null
  pic_nama?: string
  satker?: { nama_satker?: string }
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function errorMessage(error: unknown) {
  return axios.isAxiosError(error)
    ? error.response?.data?.message || 'Gagal memproses pengembalian usulan.'
    : 'Gagal memproses pengembalian usulan.'
}

export default function PerbaikanMassal() {
  const { notify } = useNotifications()
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState('')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setSelectedIds(new Set())
    getUsulanList({ tahun: Number(year), status: 'PENDING', limit: 0, sort_order: 'desc' })
      .then((response) => {
        if (cancelled) return
        const body = response.data
        const items: Proposal[] = Array.isArray(body) ? body : body?.data ?? []
        setProposals(items)
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setProposals([])
          setError(errorMessage(requestError))
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [year, reloadKey])

  const visibleProposals = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id-ID')
    if (!term) return proposals
    return proposals.filter((proposal) => [proposal.judul, proposal.satker?.nama_satker, proposal.pic_nama]
      .some((value) => value?.toLocaleLowerCase('id-ID').includes(term)))
  }, [proposals, search])

  const allVisibleSelected = visibleProposals.length > 0
    && visibleProposals.every((proposal) => selectedIds.has(proposal.id))

  const toggleOne = (id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < 200) next.add(id)
      else notify('Maksimal 200 usulan dapat diproses dalam satu kali pengembalian.', 'warning')
      return next
    })
  }

  const toggleVisible = () => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) {
        visibleProposals.forEach((proposal) => next.delete(proposal.id))
      } else {
        for (const proposal of visibleProposals) {
          if (next.size >= 200) break
          next.add(proposal.id)
        }
        if (visibleProposals.some((proposal) => !next.has(proposal.id))) {
          notify('Maksimal 200 usulan dapat diproses dalam satu kali pengembalian.', 'warning')
        }
      }
      return next
    })
  }

  const submitBulkReturn = async () => {
    const cleanNote = note.trim()
    if (!selectedIds.size) return
    if (!cleanNote) {
      notify('Isi keterangan perbaikan terlebih dahulu.', 'warning')
      return
    }
    setSaving(true)
    setError('')
    try {
      const { data } = await kembalikanUsulanMassal([...selectedIds], cleanNote)
      notify(`${data.updated} usulan dikembalikan ke Satker dengan keterangan yang sama.`, 'success')
      setModalOpen(false)
      setNote('')
      setSelectedIds(new Set())
      setReloadKey((value) => value + 1)
    } catch (requestError: unknown) {
      setError(errorMessage(requestError))
      setModalOpen(false)
      notify(errorMessage(requestError), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
      <header className="flex flex-col gap-4 rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50 via-white to-orange-50 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2" /></svg>
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Perbaikan Massal</h1>
              <p className="mt-1 text-sm text-slate-600">Kembalikan beberapa usulan ke Satker dengan satu keterangan yang sama.</p>
            </div>
          </div>
        </div>
        <YearSelect value={year} onChange={setYear} />
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <label className="relative block w-full sm:max-w-md">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path strokeLinecap="round" d="m20 20-4-4"/></svg>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari usulan, Satker, atau PIC..." className="h-11 w-full rounded-xl border border-slate-200 pl-10 pr-3 text-sm outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">{proposals.length} usulan perlu ditinjau</span>
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-sm font-semibold text-amber-800">{selectedIds.size} dipilih</span>
            <button type="button" disabled={!selectedIds.size || saving} onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2" /></svg>
              Kembalikan terpilih
            </button>
          </div>
        </div>

        {error && <div role="alert" className="m-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 px-4 py-3 text-center"><input type="checkbox" aria-label="Pilih semua usulan yang terlihat" checked={allVisibleSelected} onChange={toggleVisible} disabled={loading || visibleProposals.length === 0} className="h-4 w-4 rounded border-slate-300 accent-amber-600" /></th>
                <th className="w-16 px-3 py-3 text-center">No</th>
                <th className="px-4 py-3">Tanggal masuk</th>
                <th className="px-4 py-3">Satker</th>
                <th className="px-4 py-3">Judul inovasi</th>
                <th className="px-4 py-3">PIC</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500">Memuat daftar usulan…</td></tr>
                : visibleProposals.length === 0 ? <tr><td colSpan={7} className="px-4 py-16 text-center text-slate-500">Tidak ada usulan berstatus Sedang Direview untuk tahun ini.</td></tr>
                  : visibleProposals.map((proposal, index) => <tr key={proposal.id} className={`transition hover:bg-amber-50/40 ${selectedIds.has(proposal.id) ? 'bg-amber-50/70' : ''}`}>
                    <td className="px-4 py-4 text-center"><input type="checkbox" aria-label={`Pilih usulan ${proposal.judul}`} checked={selectedIds.has(proposal.id)} onChange={() => toggleOne(proposal.id)} className="h-4 w-4 rounded border-slate-300 accent-amber-600" /></td>
                    <td className="px-3 py-4 text-center tabular-nums text-slate-500">{index + 1}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-slate-600">{formatDate(proposal.submitted_at ?? proposal.created_at)}</td>
                    <td className="max-w-56 px-4 py-4 font-medium text-slate-700">{proposal.satker?.nama_satker ?? '—'}</td>
                    <td className="max-w-md px-4 py-4 font-semibold text-slate-900">{proposal.judul || 'Tanpa judul'}</td>
                    <td className="px-4 py-4 text-slate-600">{proposal.pic_nama || '—'}</td>
                    <td className="px-4 py-4"><span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">Sedang Direview</span></td>
                  </tr>)}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-col gap-1 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <span>Daftar hanya menampilkan usulan tahun {year} yang sedang direview.</span>
          <span>Maksimal 200 usulan per proses.</span>
        </footer>
      </section>

      {modalOpen && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModalOpen(false) }}>
        <section role="dialog" aria-modal="true" aria-labelledby="bulk-return-title" className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="border-b border-slate-100 px-6 py-5">
            <h2 id="bulk-return-title" className="text-lg font-semibold text-slate-900">Kembalikan usulan untuk perbaikan</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">{selectedIds.size} usulan akan dikembalikan ke Satker dengan keterangan yang sama.</p>
          </header>
          <div className="space-y-2 px-6 py-5">
            <label htmlFor="bulk-return-note" className="text-sm font-semibold text-slate-700">Keterangan perbaikan <span className="text-rose-600">*</span></label>
            <textarea id="bulk-return-note" autoFocus maxLength={2000} rows={5} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Tuliskan perbaikan yang perlu dilakukan Satker…" className="w-full resize-y rounded-xl border border-slate-200 px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100" />
            <p className="text-right text-xs text-slate-400">{note.length}/2.000 karakter</p>
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/70 px-6 py-4">
            <button type="button" disabled={saving} onClick={() => setModalOpen(false)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-50">Batal</button>
            <button type="button" disabled={saving || !note.trim()} onClick={() => void submitBulkReturn()} className="h-10 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Memproses…' : `Kembalikan ${selectedIds.size} usulan`}</button>
          </footer>
        </section>
      </div>}
    </div>
  )
}
