type RevisionChange = { section?: string; item?: string; field?: string; before?: unknown; after?: unknown }
type RevisionLog = {
  id: string | number
  catatan_perbaikan: string
  requested_at?: string
  requested_by?: { nama_lengkap?: string } | null
  resubmitted_at?: string | null
  resubmitted_by?: { nama_lengkap?: string } | null
  changes?: RevisionChange[] | null
}

function formatRevisionDate(value?: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
}

function formatRevisionValue(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Kosong'
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  try { return JSON.stringify(value) } catch { return String(value) }
}

function PersonAndDate({ name, date }: { name?: string; date?: string | null }) {
  return <p className="mt-1.5 text-xs text-slate-500">
    {name && <span className="font-medium text-slate-600">{name}<span className="mx-1.5 text-slate-300">·</span></span>}
    {formatRevisionDate(date)}
  </p>
}

function RevisionIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5M12 7v5l3 2" />
  </svg>
}

export default function RevisionHistory({ logs = [], fallbackNote }: { logs?: RevisionLog[]; fallbackNote?: string | null }) {
  if (!logs.length && !fallbackNote) return null

  return <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-gradient-to-r from-amber-50 via-white to-white px-4 py-4 outline-none transition hover:from-amber-100/70 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-500 sm:px-5 [&::-webkit-details-marker]:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <RevisionIcon />
        </span>
        <div className="min-w-0">
          <h3 className="font-bold text-slate-900">Riwayat Perbaikan</h3>
          <p className="mt-0.5 text-sm text-slate-600">Catatan reviewer dan perubahan dari Satker.</p>
        </div>
      </div>
      <span className="flex shrink-0 items-center gap-2">
        {logs.length > 0 && <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
          {logs.length} {logs.length === 1 ? 'siklus' : 'siklus perbaikan'}
        </span>}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 text-slate-400 transition group-open:rotate-180">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.09 1.03l-4.25 4.5a.75.75 0 0 1-1.09 0l-4.25-4.5a.75.75 0 0 1 .02-1.05Z" clipRule="evenodd" />
        </svg>
      </span>
    </summary>

    <div className="space-y-3 border-t border-slate-100 p-3 sm:p-4">
      {!logs.length && fallbackNote && <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-amber-800">Catatan reviewer</p>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{fallbackNote}</p>
      </article>}

      {logs.map((log, index) => {
        const changes = Array.isArray(log.changes) ? log.changes : []
        const resubmitted = Boolean(log.resubmitted_at)
        const cycleNumber = logs.length - index
        return <details key={log.id} open={index === 0} className="group overflow-hidden rounded-xl border border-slate-200 bg-white open:shadow-sm">
          <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${resubmitted ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                  Siklus perbaikan {cycleNumber}
                  {index === 0 && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal-700">Terbaru</span>}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{formatRevisionDate(log.requested_at)}</span>
              </span>
            </span>
            <span className="flex items-center gap-2.5">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${resubmitted ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                {resubmitted ? 'Sudah dikirim ulang' : 'Menunggu perbaikan Satker'}
              </span>
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-180">
                <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.938a.75.75 0 1 1 1.09 1.03l-4.25 4.5a.75.75 0 0 1-1.09 0l-4.25-4.5a.75.75 0 0 1 .02-1.05Z" clipRule="evenodd" />
              </svg>
            </span>
          </summary>

          <div className="space-y-4 border-t border-slate-100 px-4 py-4">
            <section className="rounded-lg border border-amber-100 bg-amber-50/50 p-3.5 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <h4 className="text-sm font-semibold text-amber-950">Catatan reviewer</h4>
                <PersonAndDate name={log.requested_by?.nama_lengkap} date={log.requested_at} />
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-800">{log.catatan_perbaikan || 'Tidak ada catatan.'}</p>
            </section>

            {resubmitted && <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-slate-800">Perubahan dari Satker</h4>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{changes.length}</span>
                </div>
                <PersonAndDate name={log.resubmitted_by?.nama_lengkap} date={log.resubmitted_at} />
              </div>

              {changes.length ? <ul className="grid gap-2.5 lg:grid-cols-2">
                {changes.map((change, changeIndex) => <li key={`${change.field}-${changeIndex}`} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50/70 p-3.5">
                  {change.section && <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">{change.section}</p>}
                  <p className="break-words text-sm font-semibold text-slate-800">{change.item ? <><span>{change.item}</span><span className="mx-1.5 text-slate-300">·</span></> : null}{change.field || 'Perubahan'}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {change.before !== undefined && <div className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Sebelum</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{formatRevisionValue(change.before)}</p>
                    </div>}
                    {change.after !== undefined && <div className="min-w-0 rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Sesudah</p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{formatRevisionValue(change.after)}</p>
                    </div>}
                  </div>
                </li>)}
              </ul> : <p className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-600">Tidak ada perubahan pada kolom yang tercatat.</p>}
            </section>}
          </div>
        </details>
      })}
    </div>
  </details>
}
