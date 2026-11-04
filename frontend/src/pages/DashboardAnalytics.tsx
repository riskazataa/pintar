import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ComposedChart, Line
} from 'recharts'
import axios from 'axios'
import { getStatsInovasi } from '../services/inovasi.service'
import { normalizeKriteriaInovasi } from '../utils/kriteria-inovasi'
import YearSelect from '../components/YearSelect'

// ─── Types ───────────────────────────────────────────
interface StatItem {
  label: string
  value: number
}

interface TimelineItem {
  date: string
  count: number
  lolosSeleksiAwal: number
  lolosPenilaianAkhir: number
  persenSeleksiAwal: number
  persenPenilaianAkhir: number
}

interface StageMonitorItem {
  label: string
  sedang_direview: number
  menunggu_ttd: number
  perbaikan: number
  lolos: number
  tidak_lolos: number
}

interface StatsData {
  totalUsulan: number
  sedangDireview: number
  disetujui: number
  lolos: number
  ditolak: number
  perbaikan: number
  statusData: StatItem[]
  jenisData: StatItem[]
  kriteriaData: StatItem[]
  timelineData: TimelineItem[]
  stageMonitorData: StageMonitorItem[]
}

const EMPTY_STATS: StatsData = {
  totalUsulan: 0,
  sedangDireview: 0,
  disetujui: 0,
  lolos: 0,
  ditolak: 0,
  perbaikan: 0,
  statusData: [],
  jenisData: [],
  kriteriaData: [],
  timelineData: [],
  stageMonitorData: [],
}

const COLORS = [
  '#007C7B', '#13AF9A', '#42AE78', '#0AB2B8', '#E5832B', '#C0B22B',
  '#CCD92B', '#F1F4BD', '#BFBFBF', '#8B8A86', '#686765', '#C00000', '#C3EAE6',
]

const STATUS_COLORS: Record<string, string> = {
  'APPROVED': '#0AB2B8',
  'REJECTED': '#C00000',
  'PERBAIKAN': '#C0B22B',
  'SEDANG_DIREVIEW': '#E5832B',
  'LOLOS': '#42AE78',
  'TIDAK_LOLOS': '#C00000',
}

const CARD_CONFIG = [
  {
    key: 'totalUsulan' as const, label: 'Total Usulan',
    color: '#007C7B', tint: '#E6F4F3',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    key: 'sedangDireview' as const, label: 'Sedang Direview',
    color: '#E5832B', tint: '#FFF1E5',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'disetujui' as const, label: 'Menunggu Tanda Tangan',
    color: '#0AB2B8', tint: '#E5F8F7',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'ditolak' as const, label: 'Tidak Lolos',
    color: '#C00000', tint: '#FBEAEA',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'lolos' as const, label: 'Lolos',
    color: '#42AE78', tint: '#E9F6EF',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'perbaikan' as const, label: 'Perlu Perbaikan',
    color: '#B6A92B', tint: '#F8F5DC',
    icon: <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  },
]

// === SMART NORMALIZER ===
function normalizeStats(rawInput: any, selectedStage = 1): StatsData {
  const raw = rawInput?.data ? rawInput.data : (rawInput || {})
  const summary = raw.summary_cards || {}

  const totalUsulan = summary.total_usulan ?? raw.total_usulan ?? 0
  const legacyPending = summary.total_pending ?? raw.pending ?? 0
  const legacyApproved = summary.total_approved ?? raw.disetujui ?? 0
  const legacyRejected = summary.total_rejected ?? raw.ditolak ?? 0
  const legacyPerbaikan = summary.total_perbaikan ?? raw.perbaikan ?? 0

  const jenisData = Array.isArray(raw.chart_status) ? raw.chart_status.map((item: any) => ({
    label: String(item.jenis_inovasi || 'Lainnya'),
    value: Number(item.total || 0)
  })).filter((item: StatItem) => item.value > 0) : []

  const kriteriaMap = new Map<string, number>()
  const chartKriteria = selectedStage === 1 ? raw.chart_kriteria_seleksi_awal : raw.chart_kriteria
  if (Array.isArray(chartKriteria)) {
    chartKriteria.forEach((item: any) => {
      if (Array.isArray(item.kriteria_inovasi)) {
        normalizeKriteriaInovasi(item.kriteria_inovasi).forEach((crit) => {
          kriteriaMap.set(crit, (kriteriaMap.get(crit) || 0) + Number(item.total || 0))
        })
      }
    })
  }
  const kriteriaData = Array.from(kriteriaMap.entries()).map(([label, value]) => ({ label, value }))

  const timelineData = Array.isArray(raw.chart_timeline) ? raw.chart_timeline.map((t: any) => ({
    date: t.bulan || t.date || 'Unknown',
    count: Number(t.total_usulan ?? t.total ?? t.count ?? 0),
    lolosSeleksiAwal: Number(t.lolos_seleksi_awal || 0),
    lolosPenilaianAkhir: Number(t.lolos_penilaian_akhir || 0),
    persenSeleksiAwal: Number(t.persentase_seleksi_awal || 0),
    persenPenilaianAkhir: Number(t.persentase_penilaian_akhir || 0),
  })) : []

  const stageMonitorData: StageMonitorItem[] = Array.isArray(raw.chart_tahap) ? raw.chart_tahap.map((item: any) => ({
    label: String(item.label || 'Tahap'),
    sedang_direview: Number(item.sedang_direview || 0) + Number(item.menunggu_review || 0),
    menunggu_ttd: Number(item.menunggu_ttd || 0),
    perbaikan: Number(item.perbaikan || 0),
    lolos: Number(item.lolos || 0),
    tidak_lolos: Number(item.tidak_lolos || 0),
  })) : []

  const selectedStageData = stageMonitorData.find((item) => item.label === `Tahap ${selectedStage}`)
  const sedangDireview = selectedStageData?.sedang_direview ?? legacyPending
  const disetujui = selectedStageData?.menunggu_ttd ?? legacyApproved
  const lolos = selectedStageData?.lolos ?? Number(summary.total_lolos ?? raw.lolos ?? 0)
  const ditolak = selectedStageData?.tidak_lolos ?? legacyRejected
  const perbaikan = Number(summary.total_perbaikan ?? legacyPerbaikan)
  const selectedStageStatuses: StatItem[] = selectedStageData ? [
    { label: 'Sedang Direview', value: selectedStageData.sedang_direview },
    { label: 'Menunggu Tanda Tangan', value: selectedStageData.menunggu_ttd },
    { label: 'Perlu Perbaikan', value: selectedStageData.perbaikan },
    { label: 'Lolos', value: selectedStageData.lolos },
    { label: 'Tidak Lolos', value: selectedStageData.tidak_lolos },
  ] : []
  const statusData = (selectedStageData ? selectedStageStatuses : [
    { label: 'Sedang Direview', value: sedangDireview },
    { label: 'Menunggu Tanda Tangan', value: disetujui },
    { label: 'Lolos', value: lolos },
    { label: 'Tidak Lolos', value: ditolak },
    { label: 'Perlu Perbaikan', value: perbaikan },
  ]).filter((item: StatItem) => item.value > 0)

  return {
    totalUsulan,
    sedangDireview,
    disetujui,
    lolos,
    ditolak,
    perbaikan,
    statusData,
    jenisData,
    kriteriaData,
    timelineData: timelineData.length > 1 ? timelineData : timelineData.length === 1 ? [{ date: 'Awal', count: 0 }, ...timelineData] : [],
    stageMonitorData,
  }
}

function getUser() {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function SummaryCard({ config, value }: { config: typeof CARD_CONFIG[0]; value: number }) {
  return (
    <div className="group relative flex h-full min-h-[164px] flex-col overflow-hidden rounded-2xl border p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg" style={{ backgroundColor: config.tint, borderColor: `${config.color}30` }}>
      <div className="flex flex-1 items-start justify-between gap-2">
        <div className="flex flex-1 flex-col">
          <p className="min-h-10 text-sm font-medium text-gray-500">{config.label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight" style={{ color: config.color }}>
            {value.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="rounded-xl p-3 shadow-sm" style={{ backgroundColor: `${config.color}20`, color: config.color }}>
          {config.icon}
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl opacity-40" style={{ backgroundColor: config.color }} />
    </div>
  )
}

// Menambahkan properti "action" opsional untuk tempat tombol filter
function ChartCard({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col rounded-xl border border-gray-100 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md sm:p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        {action && <div>{action}</div>}
      </div>
      <div className="flex-1">
        {children}
      </div>
    </div>
  )
}

export default function DashboardAnalytics() {
  const [rawStats, setRawStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedStage, setSelectedStage] = useState<1 | 2>(1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const requestId = useRef(0)
  const user = getUser()
  const nama = user?.nama_lengkap || 'Pengguna'
  const reviewerStageLabel = user?.role === 'REVIEWER' || user?.role === 'UNIT'
    ? selectedStage === 1 ? 'Seleksi Awal' : 'Penilaian Akhir'
    : null

  // State untuk filter waktu timeline (Week, Month, Year)
  const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'year'>('month')
  const stats = useMemo(() => rawStats ? normalizeStats(rawStats, selectedStage) : EMPTY_STATS, [rawStats, selectedStage])

  const fetchStats = useCallback(async () => {
    const currentRequestId = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const response = await getStatsInovasi(selectedYear)
      if (currentRequestId === requestId.current) setRawStats(response.data)
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) && err.response?.data?.message
        ? err.response.data.message
        : 'Gagal memuat data statistik.'
      if (currentRequestId === requestId.current) setError(msg)
    } finally {
      if (currentRequestId === requestId.current) setLoading(false)
    }
  }, [selectedYear])

  useEffect(() => { void fetchStats() }, [fetchStats])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-5 w-64 animate-pulse rounded-md bg-gray-200" />
        <div className="h-4 w-48 animate-pulse rounded-md bg-gray-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />)}
        </div>
        <div className="h-80 animate-pulse rounded-xl bg-white shadow-sm" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-red-100 bg-red-50 px-6 py-16 text-center">
        <svg className="mb-4 h-14 w-14 text-red-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
        <h3 className="mb-1 text-base font-semibold text-red-800">Gagal Memuat Data</h3>
        <p className="mb-4 text-sm text-red-600">{error}</p>
        <button onClick={fetchStats} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-medium text-white shadow transition hover:bg-red-700">
          Coba Lagi
        </button>
      </div>
    )
  }

  const { statusData, jenisData, kriteriaData, timelineData } = stats

  const labelToStatusKey = (label: string): string => {
    if (label === 'Sedang Direview') return 'SEDANG_DIREVIEW'
    if (label === 'Menunggu Tanda Tangan') return 'APPROVED'
    if (label === 'Lolos') return 'LOLOS'
    if (label === 'Disetujui') return 'APPROVED'
    if (label === 'Tidak Lolos' || label === 'Ditolak') return 'TIDAK_LOLOS'
    if (label === 'Perlu Perbaikan') return 'PERBAIKAN'
    return label.toUpperCase()
  }

  // Komponen UI untuk Tombol Filter
  const timeFilterUI = (
    <div className="flex items-center rounded-lg bg-gray-50 p-1">
      {['Week', 'Month', 'Year'].map((f) => {
        const value = f.toLowerCase() as 'week' | 'month' | 'year'
        return (
          <button
            key={f}
            onClick={() => setTimeFilter(value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              timeFilter === value
                ? 'bg-white text-[#007C7B] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Selamat datang, <span className="text-[#007C7B]">{nama}</span>
          </h2>
          <p className="text-sm text-gray-500">{reviewerStageLabel ? `Dashboard pemantauan ${reviewerStageLabel}` : 'Pusat monitoring dan visualisasi data usulan inovasi'}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <YearSelect value={selectedYear} onChange={(year) => { setLoading(true); setRawStats(null); setSelectedYear(Number(year)) }} />
          {(user?.role === 'REVIEWER' || user?.role === 'UNIT') && <div role="tablist" aria-label="Tahap dashboard" className="inline-flex w-fit rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
            <button type="button" role="tab" aria-selected={selectedStage === 1} onClick={() => setSelectedStage(1)} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${selectedStage === 1 ? 'bg-[#007C7B] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>Seleksi Awal</button>
            <button type="button" role="tab" aria-selected={selectedStage === 2} onClick={() => setSelectedStage(2)} className={`rounded-lg px-4 py-2 text-sm font-medium transition ${selectedStage === 2 ? 'bg-[#007C7B] text-white shadow-sm' : 'text-gray-600 hover:bg-gray-50'}`}>Penilaian Akhir</button>
          </div>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {CARD_CONFIG.map((cfg) => (
          <SummaryCard key={cfg.key} config={cfg} value={stats[cfg.key]} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title={reviewerStageLabel ? `Persentase Status ${reviewerStageLabel}` : 'Persentase Status Usulan'}>
          {statusData.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-gray-400 border border-dashed rounded-lg">Data status belum tersedia</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={75}
                  outerRadius={110}
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="label" 
                >
                  {statusData.map((_entry, i) => (
                    <Cell key={i} fill={STATUS_COLORS[labelToStatusKey(_entry.label)] || COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Legend formatter={(value: string) => <span className="text-sm font-medium text-gray-700">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Persentase Jenis Inovasi">
          {jenisData.length === 0 ? (
            <div className="flex h-72 items-center justify-center text-sm text-gray-400 border border-dashed rounded-lg">Data jenis inovasi belum tersedia</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={jenisData}
                  cx="50%"
                  cy="50%"
                  innerRadius={0}
                  outerRadius={110}
                  dataKey="value"
                  nameKey="label" 
                >
                  {jenisData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Legend formatter={(value: string) => <span className="text-sm font-medium text-gray-700">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Distribusi Kriteria Inovasi">
        {kriteriaData.length === 0 ? (
          <div className="flex h-72 items-center justify-center text-sm text-gray-400 border border-dashed rounded-lg">Belum ada usulan untuk dikelompokkan berdasarkan kriteria</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={kriteriaData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} stroke="#6b7280" width={140} />
              <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="value" name="Jumlah" fill="#007C7B" radius={[0, 6, 6, 0]} barSize={24}>
                {kriteriaData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Menambahkan UI Filter Waktu di properti action */}
      <ChartCard title="Tren Usulan" action={timeFilterUI}>
        {timelineData.length === 0 || stats.totalUsulan === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400 border border-dashed rounded-lg">Data tren waktu belum tersedia</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={timelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis yAxisId="jumlah" tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis yAxisId="persentase" orientation="right" domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} tickFormatter={(value: number) => `${value}%`} />
              <Tooltip
                formatter={(value, name) => [
                  String(name).startsWith('%') ? `${Number(value).toFixed(1)}%` : Number(value).toLocaleString('id-ID'),
                  name,
                ]}
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -1px rgba(0,0,0,0.1)' }}
              />
              <Legend formatter={(value: string) => <span className="text-xs font-medium text-gray-700">{value}</span>} />
              <Line type="monotone" yAxisId="jumlah" dataKey="count" name="Usulan Satker" stroke="#007C7B" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" yAxisId="jumlah" dataKey="lolosSeleksiAwal" name="Lolos Seleksi Awal" stroke="#E5832B" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" yAxisId="jumlah" dataKey="lolosPenilaianAkhir" name="Lolos Penilaian Akhir" stroke="#42AE78" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" yAxisId="persentase" dataKey="persenSeleksiAwal" name="% Lolos Seleksi Awal" stroke="#C00000" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} />
              <Line type="monotone" yAxisId="persentase" dataKey="persenPenilaianAkhir" name="% Lolos Penilaian Akhir" stroke="#6950A1" strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
