import { useEffect, useState } from 'react'
import axios from 'axios'
import { getUsulanList } from '../services/inovasi.service'
import { workflowDetail } from '../services/workflow.service'
import type { Detail } from '../services/workflow.service'
import StageAssessment from './tim-penilai/StageAssessment'

interface Item {
  id: number
  judul: string
  satker?: { nama_satker: string }
  workflow: {
    active: number
    stages: { nama: string; result: string | null }[]
  } | null
}
function getUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')
  } catch {
    return {}
  }
}
export default function Inovasi({
  resultsOnly = false,
}: {
  resultsOnly?: boolean
}) {
  const user = getUser()
  const [items, setItems] = useState<Item[]>([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [stage, setStage] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const params = {
        page: 1,
        limit: 100,
        assignedToMe: ['TIM_PENILAI_MARVEL', 'TIM_PENILAI_ITJEN'].includes(
          user.role,
        )
          ? true
          : undefined,
      }
      const first = await getUsulanList(params)
      let rows = first.data.data || first.data
      for (let page = 2; page <= (first.data.meta?.total_pages || 1); page++) {
        const next = await getUsulanList({ ...params, page })
        rows = [...rows, ...next.data.data]
      }
      setItems(rows)
    } catch {
      setError('Gagal memuat inovasi. Silakan muat ulang.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    setDetail(null)
    setStage(null)
    void load()
  }, [resultsOnly])
  const open = async (id: number) => {
    setLoading(true)
    setError('')
    try {
      setDetail((await workflowDetail(id)).data)
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? e.response?.data?.message || e.message
          : 'Gagal memuat tahapan',
      )
    } finally {
      setLoading(false)
    }
  }
  if (detail && stage !== null)
    return (
      <StageAssessment
        key={`${detail.id}:${stage}`}
        stage={stage}
        inovasiId={detail.id}
        resultsOnly={resultsOnly}
        onBack={() => {
          setStage(null)
          void open(detail.id)
        }}
      />
    )
  const visible = items.filter(
    (item) =>
      item.workflow &&
      (!resultsOnly || item.workflow.stages.some((s) => s.result)) &&
      item.judul.toLowerCase().includes(search.toLowerCase()),
  )
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            {resultsOnly ? 'Hasil Inovasi' : 'Inovasi'}
          </h2>
          <p className="text-sm text-gray-500">
            {detail
              ? `${detail.judul} • ${detail.satker.nama_satker}`
              : 'Pilih inovasi untuk membuka tahapan assessment'}
          </p>
        </div>
        <div className="flex gap-2">
          {user.role === 'SATKER' && (
            <a
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white"
              href="/satker/usulan"
            >
              Buat / Kelola Usulan
            </a>
          )}
          <button
            disabled={loading}
            className="rounded-lg border bg-white px-4 py-2 text-sm text-gray-600"
            onClick={() => (detail ? void open(detail.id) : void load())}
          >
            Muat Ulang
          </button>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {detail ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              className="text-sm text-violet-600"
              onClick={() => {
                setDetail(null)
                void load()
              }}
            >
              ← Daftar Inovasi
            </button>
            <span className="text-xs text-gray-500">
              {detail.template} • Putaran {detail.workflow.round}
            </span>
          </div>
          {detail.workflow.active === 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
              Menunggu perbaikan self assessment satker.{' '}
              {detail.catatan_perbaikan}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {detail.workflow.config.stages.map((template, index) => {
              const s = detail.workflow.stages[index]
              const label =
                s.result === 'LOLOS'
                  ? 'Lolos'
                  : s.result === 'TIDAK_LOLOS'
                    ? 'Tidak Lolos'
                    : detail.workflow.active === 0
                      ? 'Menunggu perbaikan satker'
                      : detail.workflow.active === index + 1
                        ? 'Sedang berjalan'
                        : 'Belum dimulai'
              return (
                <div
                  key={index}
                  className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                      Tahap {index + 1}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${s.result === 'LOLOS' ? 'bg-green-100 text-green-700' : s.result === 'TIDAK_LOLOS' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {label}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-800">
                    {template.nama}
                  </h3>
                  <p className="mt-2 flex-1 text-sm text-gray-500">
                    {template.questions.length} pertanyaan •{' '}
                    {s.reviewer_ids.length} reviewer • {s.signatures.length}{' '}
                    tanda tangan
                  </p>
                  <button
                    disabled={loading || (resultsOnly && !s.result)}
                    className="mt-5 rounded-lg border border-violet-200 px-4 py-2 text-sm font-medium text-violet-700 hover:bg-violet-50 disabled:opacity-40"
                    onClick={() => setStage(index + 1)}
                  >
                    {resultsOnly ? 'Lihat Hasil' : 'Buka Tahap'}
                  </button>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <>
          <div className="rounded-xl border bg-white p-4">
            <input
              aria-label="Cari inovasi"
              placeholder="Cari judul inovasi…"
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-5 py-4">Inovasi</th>
                  <th className="px-5 py-4">Tahapan</th>
                  <th className="px-5 py-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="p-10 text-center text-gray-400">
                      Memuat inovasi…
                    </td>
                  </tr>
                ) : visible.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="p-10 text-center text-gray-400">
                      Belum ada inovasi
                      {resultsOnly
                        ? ' dengan hasil penilaian'
                        : ' yang tersedia'}
                      .
                    </td>
                  </tr>
                ) : (
                  visible.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-gray-800">
                          {item.judul}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.satker?.nama_satker}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-gray-500">
                        {item.workflow?.stages.length} tahap
                        {item.workflow?.active === 0
                          ? ' • Perbaikan satker'
                          : ` • ${item.workflow?.stages[(item.workflow?.active || 1) - 1]?.nama || ''}`}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          disabled={loading}
                          className="rounded-lg bg-violet-50 px-3 py-2 font-medium text-violet-700 hover:bg-violet-100"
                          onClick={() => void open(item.id)}
                        >
                          Buka Tahapan →
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {user.role.startsWith('TIM_PENILAI') && (
            <a
              className="block text-sm text-violet-600"
              href="/tim-penilai/tahap-1/legacy"
            >
              Usulan versi lama
            </a>
          )}
        </>
      )}
    </div>
  )
}
