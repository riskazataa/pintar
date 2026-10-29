import { useEffect, useState } from 'react'
import {
  ResponsiveContainer,
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line // Menggunakan LineChart untuk menyesuaikan desain baru
} from 'recharts'
import axios from 'axios'
import { getStatsInovasi } from '../services/inovasi.service'

// ─── Types ───────────────────────────────────────────
interface StatItem {
  label: string
  value: number
}

interface TimelineItem {
  date: string
  count: number
}

interface StatsData {
  totalUsulan: number
  pending: number
  disetujui: number
  ditolak: number
  perbaikan: number
  statusData: StatItem[]
  jenisData: StatItem[]
  kriteriaData: StatItem[]
  timelineData: TimelineItem[]
}

const EMPTY_STATS: StatsData = {
  totalUsulan: 0,
  pending: 0,
  disetujui: 0,
  ditolak: 0,
  perbaikan: 0,
  statusData: [],
  jenisData: [],
  kriteriaData: [],
  timelineData: [],
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6']

const STATUS_COLORS: Record<string, string> = {
  'PENDING': '#f59e0b',     // Kuning/Amber
  'APPROVED': '#10b981',    // Hijau
  'REJECTED': '#ef4444',    // Merah
  'PERBAIKAN': '#9333ea'    // Ungu
}

const CARD_CONFIG = [
  {
    key: 'totalUsulan' as const, label: 'Total Usulan',
    valueColor: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', iconBg: 'bg-blue-100', lineColor: 'bg-blue-600',
    icon: <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    key: 'pending' as const, label: 'Menunggu',
    valueColor: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', iconBg: 'bg-amber-100', lineColor: 'bg-amber-600',
    icon: <svg className="h-5 w-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'disetujui' as const, label: 'Disetujui',
    valueColor: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', iconBg: 'bg-emerald-100', lineColor: 'bg-emerald-600',
    icon: <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'ditolak' as const, label: 'Ditolak',
    valueColor: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', iconBg: 'bg-rose-100', lineColor: 'bg-rose-600',
    icon: <svg className="h-5 w-5 text-rose-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  },
  {
    key: 'perbaikan' as const, label: 'Perbaikan',
    valueColor: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', iconBg: 'bg-purple-100', lineColor: 'bg-purple-600',
    icon: <svg className="h-5 w-5 text-purple-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  },
]

// === SMART NORMALIZER ===
function normalizeStats(rawInput: any): StatsData {
  const raw = rawInput?.data ? rawInput.data : (rawInput || {})
  const summary = raw.summary_cards || {}

  const totalUsulan = summary.total_usulan ?? raw.total_usulan ?? 0
  const pending = summary.total_pending ?? raw.pending ?? 0
  const disetujui = summary.total_approved ?? raw.disetujui ?? 0
  const ditolak = summary.total_rejected ?? raw.ditolak ?? 0
  const perbaikan = summary.total_perbaikan ?? raw.perbaikan ?? 0

  const statusData = [
    { label: 'Menunggu', value: pending },
    { label: 'Disetujui', value: disetujui },
    { label: 'Ditolak', value: ditolak },
    { label: 'Perbaikan', value: perbaikan },
  ].filter((item: StatItem) => item.value > 0) 

  const jenisData = Array.isArray(raw.chart_status) ? raw.chart_status.map((item: any) => ({
    label: String(item.jenis_inovasi || 'Lainnya'),
    value: Number(item.total || 0)
  })).filter((item: StatItem) => item.value > 0) : []

  const kriteriaMap = new Map<string, number>()
  if (Array.isArray(raw.chart_kriteria)) {
    raw.chart_kriteria.forEach((item: any) => {
      if (Array.isArray(item.kriteria_inovasi)) {
        item.kriteria_inovasi.forEach((crit: string) => {
          kriteriaMap.set(crit, (kriteriaMap.get(crit) || 0) + Number(item.total || 0))
        })
      }
    })
  }
  const kriteriaData = Array.from(kriteriaMap.entries()).map(([label, value]) => ({ label, value }))

  const timelineData = Array.isArray(raw.chart_timeline) ? raw.chart_timeline.map((t: any) => ({
    date: t.bulan || t.date || 'Unknown',
    count: Number(t.total || t.count || 0),
  })) : []

  return {
    totalUsulan,
    pending,
    disetujui,
    ditolak,
    perbaikan,
    statusData,
    jenisData,
    kriteriaData,
    timelineData: timelineData.length > 1 ? timelineData : timelineData.length === 1 ? [{ date: 'Awal', count: 0 }, ...timelineData] : [],
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
    <div className={`group relative overflow-hidden rounded-2xl border ${config.border} ${config.bg} p-6 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500">{config.label}</p>
          <p className={`mt-2 text-3xl font-bold tracking-tight ${config.valueColor}`}>
            {value.toLocaleString('id-ID')}
          </p>
        </div>
        <div className={`rounded-xl ${config.iconBg} p-3 shadow-sm`}>
          {config.icon}
        </div>
      </div>
      <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl ${config.lineColor} opacity-30`} />
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
  const [stats, setStats] = useState<StatsData>(EMPTY_STATS)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const user = getUser()
  const nama = user?.nama_lengkap || 'Pengguna'

  // State untuk filter waktu timeline (Week, Month, Year)
  const [timeFilter, setTimeFilter] = useState<'week' | 'month' | 'year'>('month')

  // Refetch data jika timeFilter berubah (opsional, jika backend mu mendukung parameternya)
  useEffect(() => {
    fetchStats()
  }, [timeFilter])

  async function fetchStats() {
    setLoading(true)
    setError('')
    try {
      // Catatan: Jika backend mu bisa menerima query parameter period/filter,
      // kamu bisa menambahkannya di sini, contoh: getStatsInovasi({ period: timeFilter })
      const response = await getStatsInovasi()
      setStats(normalizeStats(response.data))
    } catch (err: unknown) {
      const msg = axios.isAxiosError(err) && err.response?.data?.message
        ? err.response.data.message
        : 'Gagal memuat data statistik.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

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
    if (label === 'Menunggu') return 'PENDING'
    if (label === 'Disetujui') return 'APPROVED'
    if (label === 'Ditolak') return 'REJECTED'
    if (label === 'Perbaikan') return 'PERBAIKAN'
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
                ? 'bg-white text-blue-600 shadow-sm'
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
      <div>
        <h2 className="text-lg font-semibold text-gray-800">
          Selamat datang, <span className="text-blue-600">{nama}</span>
        </h2>
        <p className="text-sm text-gray-500">Pusat monitoring dan visualisasi data usulan inovasi</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {CARD_CONFIG.map((cfg) => (
          <SummaryCard key={cfg.key} config={cfg} value={stats[cfg.key]} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="Persentase Status Usulan">
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
              <Bar dataKey="value" name="Jumlah" fill="#8b5cf6" radius={[0, 6, 6, 0]} barSize={24}>
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
        {timelineData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-gray-400 border border-dashed rounded-lg">Data tren waktu belum tersedia</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timelineData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" tickMargin={10} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" axisLine={false} tickLine={false} />
              <Tooltip 
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} 
              />
              <Line 
                type="monotone" 
                dataKey="count" 
                name="Jumlah Usulan" 
                stroke="#3b82f6" /* Ubah kode warna hex ini jika ingin warna selain biru */
                strokeWidth={3} 
                dot={false} /* Menghilangkan titik-titik pada garis biasa */
                activeDot={{ r: 6, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }} /* Membuat titik berlubang indah saat di-hover */
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}