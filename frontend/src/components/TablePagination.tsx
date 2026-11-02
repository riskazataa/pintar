interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function TablePagination({ meta, onPage, onLimitChange }: {
  meta: PaginationMeta
  onPage: (page: number) => void
  onLimitChange: (limit: number) => void
}) {
  if (meta.total === 0) return null

  const pages: (number | string)[] = []
  for (let page = 1; page <= meta.totalPages; page++) {
    if (page === 1 || page === meta.totalPages || (page >= meta.page - 1 && page <= meta.page + 1)) pages.push(page)
    else if (pages[pages.length - 1] !== '...') pages.push('...')
  }
  const first = meta.limit === 0 ? 1 : (meta.page - 1) * meta.limit + 1
  const last = meta.limit === 0 ? meta.total : Math.min(meta.page * meta.limit, meta.total)

  return <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
        Tampilkan
        <select aria-label="Jumlah baris per halaman" value={meta.limit === 0 ? 'all' : String(meta.limit)} onChange={(event) => onLimitChange(event.target.value === 'all' ? 0 : Number(event.target.value))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100">
          <option value="5">5</option><option value="10">10</option><option value="15">15</option><option value="all">Semua</option>
        </select>
        baris
      </label>
      <span className="text-xs text-slate-500">Menampilkan {first}–{last} dari {meta.total}</span>
    </div>
    {meta.totalPages > 1 && <nav aria-label="Navigasi halaman tabel" className="flex items-center gap-1 self-end sm:self-auto">
      <button onClick={() => onPage(meta.page - 1)} disabled={meta.page <= 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Sebelumnya</button>
      {pages.map((page, index) => typeof page === 'string'
        ? <span key={`ellipsis-${index}`} className="px-1.5 text-xs text-slate-400">…</span>
        : <button key={page} aria-current={page === meta.page ? 'page' : undefined} onClick={() => onPage(page)} className={`min-w-8 rounded-lg px-2 py-1.5 text-xs font-semibold transition ${page === meta.page ? 'bg-violet-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}>{page}</button>)}
      <button onClick={() => onPage(meta.page + 1)} disabled={meta.page >= meta.totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Berikutnya</button>
    </nav>}
  </div>
}
