interface YearSelectProps {
  value: number | string
  onChange: (year: string) => void
  placeholder?: string
}

const CURRENT_YEAR = new Date().getFullYear()
const LAST_YEAR = CURRENT_YEAR + 5
const FIRST_YEAR = 2026
const YEARS = Array.from({ length: Math.max(0, LAST_YEAR - FIRST_YEAR + 1) }, (_, index) => LAST_YEAR - index)

export default function YearSelect({ value, onChange, placeholder }: YearSelectProps) {
  return (
    <label className="block min-w-40 text-xs font-medium text-slate-500">
      Tahun pengajuan
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
      </select>
    </label>
  )
}
