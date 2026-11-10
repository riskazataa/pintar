import { useState, type ReactNode } from 'react'

export type TableSortOrder = 'desc' | 'asc'

interface TableToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  searchPlaceholder?: string
  sortOrder: TableSortOrder
  onSortOrderChange: (value: TableSortOrder) => void
  onClearFilters?: () => void
  children?: ReactNode
  actions?: ReactNode
}

export default function TableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Cari data...',
  sortOrder,
  onSortOrderChange,
  onClearFilters,
  children,
  actions,
}: TableToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs flex-1">
          <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="m16 16 4 4" />
          </svg>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${filtersOpen ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10m-7 6h4" />
          </svg>
          Filter
          {(children || sortOrder !== 'desc') && <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}
        </button>
        {actions}
      </div>

      {filtersOpen && (
        <div className="mt-2.5 grid grid-cols-1 gap-2.5 border-t border-slate-100 pt-2.5 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-xs font-medium text-slate-500">
            Urutkan tanggal
            <select
              value={sortOrder}
              onChange={(event) => onSortOrderChange(event.target.value as TableSortOrder)}
              className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            >
              <option value="desc">Terbaru</option>
              <option value="asc">Terlama</option>
            </select>
          </label>
          {children}
          {onClearFilters && <div className="flex items-end"><button type="button" onClick={onClearFilters} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700">Hapus filter</button></div>}
        </div>
      )}
    </section>
  )
}
