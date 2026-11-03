import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { getUsulanDetail, getAkunTimPenilai, assignPenilai, downloadHasilEvaluasiPdf, getBAColumns } from '../../services/inovasi.service'
import { getStatusPresentation } from '../../utils/inovasi-status'
import { getReviewerStageName } from '../../utils/tahap-reviewer'
import Tahap1DetailEvaluasi from './Tahap1DetailEvaluasi'
import Tahap1DetailUsulan from './Tahap1DetailUsulan'
import { exportToExcel } from './Tahap1Hasil'

function BackLink({ to, children }: { to: string; children: string }) {
  return <Link to={to} className="group inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:-translate-x-0.5 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">
    <svg aria-hidden="true" className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5m7 7-7-7 7-7" /></svg>{children}
  </Link>
}

export default function InnovationWorkflow() {
  const { id, section } = useParams()
  const [data, setData] = useState<any>(null)
  const [stage2, setStage2] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)
  const [assignment, setAssignment] = useState<number | null>(null)
  const [selected, setSelected] = useState<number[]>([])
  const [openActions, setOpenActions] = useState<number | null>(null)
  const [openExport, setOpenExport] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    if (!id) return
    setError('')
    try {
      const response = await getUsulanDetail(id)
      const detail = response.data?.data ?? response.data
      setData(detail)
      setVersion((value) => value + 1)
      setStage2(null)
      if (detail.status === 'SELESAI_EVALUASI') {
        const second = await getUsulanDetail(id, 2)
        setStage2(second.data?.data ?? second.data)
      }
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat tahapan inovasi' : 'Gagal memuat tahapan inovasi')
    }
  }, [id])
  useEffect(() => { load() }, [load, section])
  useEffect(() => { getAkunTimPenilai().then((res) => setUsers(res.data?.data ?? res.data ?? [])).catch(() => setUsers([])) }, [])
  useEffect(() => {
    if (openActions === null) return
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !actionMenuRef.current?.contains(event.target)) {
        setOpenActions(null)
        setOpenExport(false)
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpenActions(null); setOpenExport(false) }
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openActions])
  const saveAssignment = async () => {
    if (!id || !assignment) return
    setBusy(true)
    try { await assignPenilai(id, selected, assignment); setAssignment(null); await load() }
    catch (err) { setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan penugasan' : 'Gagal menyimpan penugasan') }
    finally { setBusy(false) }
  }
  const download = async (tahap: number, format: 'pdf' | 'excel') => {
    if (!id) return
    setBusy(true)
    try {
      if (format === 'pdf') {
        const response = await downloadHasilEvaluasiPdf(id, tahap)
        const url = URL.createObjectURL(response.data)
        const link = document.createElement('a'); link.href = url; link.download = `BA_${getReviewerStageName(tahap).replace(/ /g, '_')}_${data.judul}.pdf`; link.click(); URL.revokeObjectURL(url)
      } else {
        const [detail, columns] = await Promise.all([getUsulanDetail(id, tahap), getBAColumns(tahap)])
        await exportToExcel(detail.data?.data ?? detail.data, tahap, columns.data.columns, columns.data.questionTitle, columns.data.reportHeader)
      }
    } catch { setError('Gagal mengunduh berita acara. Silakan coba lagi.') }
    finally { setBusy(false) }
  }
  if (!data) return <div className="rounded-2xl border bg-white p-8">{error || 'Memuat inovasi...'}</div>
  const base = `/tim-penilai/usulan/${id}`
  const stageRows = [
    { tahap: 1, title: getReviewerStageName(1), detail: data, locked: false },
    { tahap: 2, title: getReviewerStageName(2), detail: stage2, locked: data.status !== 'SELESAI_EVALUASI' },
  ]
  const assignmentDetail = assignment ? stageRows[assignment - 1].detail : null
  const assignmentReviewers = new Set((assignmentDetail?.penilai ?? []).map((r: any) => Number(r.id)))
  const assignmentSigners = new Set((assignmentDetail?.usulan_signatures ?? []).map((signature: any) => Number(signature.user_id)))
  const assignmentUsers = [...users, ...(assignmentDetail?.penilai ?? []).filter((reviewer: any) => !users.some((user) => String(user.id) === String(reviewer.id)))]
  const availableAssignmentUsers = assignmentUsers.filter((user) => !selected.includes(Number(user.id)))
  if (section === 'self-assessment') return <Tahap1DetailUsulan backPath={base} />
  if (section === 'tahap-1') return <Tahap1DetailEvaluasi key={`${id}-1-${version}`} tahap={1} onUpdated={load} />
  if (section === 'tahap-2') {
    if (data.status !== 'SELESAI_EVALUASI') return <div className="rounded-2xl border bg-white p-8"><BackLink to={base}>Kembali ke tahapan</BackLink><p className="mt-4 text-slate-600">Penilaian Akhir tersedia setelah Seleksi Awal selesai.</p></div>
    if (!stage2) return <div className="rounded-2xl border bg-white p-8">Memuat Penilaian Akhir...</div>
    return <Tahap1DetailEvaluasi key={`${id}-2-${version}`} tahap={2} onUpdated={load} />
  }
  return <div className="space-y-6 pb-8">
    <BackLink to="/tim-penilai/usulan">Daftar inovasi</BackLink>
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Alur Penilaian Inovasi</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{data.judul}</h1>
      <p className="mt-2 text-sm text-slate-500">{data.satker?.nama_satker || 'Unit'} · {data.pic_nama || 'PIC belum diisi'}</p>
    </div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{String(error)}</div>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[1000px] table-fixed text-left text-sm">
        <colgroup><col className="w-[18%]" /><col className="w-[17%]" /><col className="w-[33%]" /><col className="w-[32%]" /></colgroup>
        <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="whitespace-nowrap p-4">Tahap</th><th className="whitespace-nowrap p-4">Status</th><th className="whitespace-nowrap p-4">Progres Tanda Tangan</th><th className="whitespace-nowrap p-4 text-right">Aksi</th></tr></thead>
        <tbody className="divide-y divide-slate-100">
          <tr className="transition-colors hover:bg-slate-50/70"><td className="whitespace-nowrap p-4 text-sm font-semibold">Self Assessment</td><td className="whitespace-nowrap p-4"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" /></svg>Sudah Dikirim</span></td><td className="p-4 text-slate-400">—</td><td className="p-4 text-right"><Link className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100" to={`${base}/self-assessment`}><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.5-6.75 9.75-6.75S21.75 12 21.75 12 18.25 18.75 12 18.75 2.25 12 2.25 12Z" /><circle cx="12" cy="12" r="2.5" /></svg>Lihat Isian<svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" /></svg></Link></td></tr>
          {stageRows.map(({ tahap, title, detail, locked }) => {
            const reviewers = detail?.penilai ?? []
            const signatures = detail?.usulan_signatures ?? []
            const signedIds = new Set(signatures.filter((s: any) => s.tahap === tahap).map((s: any) => String(s.user_id)))
            const signed = reviewers.filter((r: any) => signedIds.has(String(r.id))).length
            const progress = reviewers.length ? Math.round(signed / reviewers.length * 100) : 0
            const status = getStatusPresentation(detail ?? {}, tahap)
            return <tr key={tahap}>
              <td className="whitespace-nowrap p-4 text-sm font-semibold text-slate-800">{title}</td>
              <td className="whitespace-nowrap p-4"><span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${locked || !reviewers.length ? 'border-slate-200 bg-slate-50 text-slate-500' : status.className}`}>{locked ? 'Menunggu Seleksi Awal Selesai' : !reviewers.length ? 'Belum Ditugaskan' : status.label}</span></td>
              <td className="p-4"><div className="mb-2 flex justify-between gap-4 text-xs text-slate-500"><span>{signed} dari {reviewers.length} penilai</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${progress}%` }} /></div><div className="mt-2 flex flex-wrap gap-1">{reviewers.map((r: any) => <span key={r.id} title={signedIds.has(String(r.id)) ? 'Sudah menandatangani' : 'Belum menandatangani'} className={`rounded-md px-2 py-1 text-xs ${signedIds.has(String(r.id)) ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{r.nama_lengkap}</span>)}</div></td>
              <td className="p-4">
                {locked ? <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs text-slate-500"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>Belum tersedia</span> : <div className="flex w-full items-center justify-end gap-2">
                  <Link to={`${base}/tahap-${tahap}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100"><svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5.25H6A2.25 2.25 0 0 0 3.75 7.5v12A2.25 2.25 0 0 0 6 21.75h12a2.25 2.25 0 0 0 2.25-2.25v-3M14.25 3.75h6v6m-9 5.25 9-9" /></svg>Evaluasi & Hasil</Link>
                  <div className="relative inline-block" ref={openActions === tahap ? actionMenuRef : undefined}>
                  <button type="button" aria-label={`Aksi ${title}`} aria-haspopup="menu" aria-expanded={openActions === tahap} onClick={() => { setOpenActions((current) => current === tahap ? null : tahap); setOpenExport(false) }} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-200">
                    <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>
                  </button>
                  {openActions === tahap && <div role="menu" className="absolute right-0 top-11 z-30 w-52 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button type="button" role="menuitem" onClick={() => { setAssignment(tahap); setSelected(reviewers.map((r: any) => Number(r.id))); setOpenActions(null) }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-violet-50 hover:text-violet-700">
                      <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-13a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm4 3v6m3-3h-6" /></svg>Atur Penilai
                    </button>
                    <div className="my-1.5 border-t border-slate-100" />
                    <button type="button" aria-haspopup="menu" aria-expanded={openExport} onClick={() => setOpenExport((value) => !value)} className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                      <span className="flex items-center gap-2.5"><svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3" /></svg>Ekspor</span>
                      <svg aria-hidden="true" className={`h-4 w-4 transition-transform ${openExport ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
                    </button>
                    {openExport && <div role="menu" className="ml-3 space-y-0.5 border-l border-slate-100 pl-2">
                      <button type="button" role="menuitem" disabled={busy || signatures.length === 0} title={signatures.length === 0 ? 'Ekspor tersedia setelah ada tanda tangan' : 'Ekspor PDF'} onClick={() => { setOpenActions(null); setOpenExport(false); download(tahap, 'pdf') }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"><svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75h6l4.5 4.5v12A1.75 1.75 0 0 1 16.25 22h-8.5A1.75 1.75 0 0 1 6 20.25V5.5a1.75 1.75 0 0 1 1.5-1.75Zm6 0v4.5H18m-9 5.25h6m-6 3h4" /></svg>PDF</button>
                      <button type="button" role="menuitem" disabled={busy || signatures.length === 0} title={signatures.length === 0 ? 'Ekspor tersedia setelah ada tanda tangan' : 'Ekspor Excel'} onClick={() => { setOpenActions(null); setOpenExport(false); download(tahap, 'excel') }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-40"><svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="3.75" y="3.75" width="16.5" height="16.5" rx="2" /><path strokeLinecap="round" d="M3.75 9.5h16.5M3.75 15h16.5M9.25 9.5v11m5.5-11v11" /></svg>Excel</button>
                    </div>}
                  </div>}
                  </div>
                </div>}
              </td>
            </tr>
          })}
        </tbody>
      </table>
    </div>
    {assignment && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssignment(null) }}>
      <section role="dialog" aria-modal="true" aria-labelledby="assignment-modal-title" className="my-auto w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-9">
        <div className="mb-7 flex items-start justify-between border-b border-slate-200 pb-5">
          <h2 id="assignment-modal-title" className="text-xl font-semibold text-slate-800 sm:text-2xl">Atur Penilai · {assignment ? getReviewerStageName(assignment) : ''}</h2>
          <button onClick={() => setAssignment(null)} aria-label="Tutup" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
        </div>
        <div className="space-y-7">
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Inovasi Terpilih</p><div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 font-medium text-blue-900">{data.judul}</div></div>
          <div><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Akun Penilai <span className="text-rose-500">*</span></p><div className="flex min-h-14 flex-wrap items-center gap-2 rounded-2xl border border-slate-300 p-2.5 focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-50">
            {selected.map((userId) => { const reviewer = assignmentUsers.find((user) => Number(user.id) === userId); if (!reviewer) return null; const locked = busy || assignmentSigners.has(userId) || (assignmentSigners.size > 0 && !assignmentReviewers.has(userId)); return <span key={userId} className="inline-flex items-center gap-2 rounded-lg border border-violet-100 bg-violet-50 py-2 pl-3 pr-2 text-sm font-medium text-violet-700">{reviewer.nama_lengkap}<button type="button" disabled={locked} aria-label={`Hapus ${reviewer.nama_lengkap}`} onClick={() => setSelected((current) => current.filter((id) => id !== userId))} className="rounded-full p-0.5 text-violet-400 hover:bg-violet-200 hover:text-violet-800 disabled:cursor-not-allowed disabled:opacity-40"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" /></svg></button></span> })}
            <select value="" disabled={busy || availableAssignmentUsers.length === 0} onChange={(event) => { const userId = Number(event.target.value); if (userId) setSelected((current) => current.includes(userId) ? current : [...current, userId]) }} className="min-w-[200px] flex-1 bg-transparent px-2 py-2 text-sm text-slate-500 outline-none disabled:cursor-not-allowed"><option value="">{availableAssignmentUsers.length ? '+ Tambah akun penilai...' : 'Semua penilai telah dipilih'}</option>{availableAssignmentUsers.map((user) => <option key={user.id} value={user.id}>{user.nama_lengkap}</option>)}</select>
          </div><p className="mt-2 text-xs text-slate-500">Penilai yang sudah menandatangani harus tetap dipertahankan.</p></div>
        </div>
        <div className="mt-8 flex justify-end gap-3 border-t border-slate-200 pt-5"><button onClick={() => setAssignment(null)} className="rounded-xl border border-slate-200 px-5 py-3 font-medium text-slate-600 transition hover:bg-slate-50">Batal</button><button disabled={busy || !selected.length} onClick={saveAssignment} className="rounded-xl bg-violet-600 px-6 py-3 font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Menyimpan...' : 'Simpan Penugasan'}</button></div>
      </section>
    </div>}
  </div>
}
