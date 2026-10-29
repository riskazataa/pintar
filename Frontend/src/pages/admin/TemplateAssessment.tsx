import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  packages,
  createPackage,
  publishPackage,
  ordered,
} from '../../services/workflow.service'
import type { Package, Config, Question } from '../../services/workflow.service'
import { getAssessmentQuestions } from '../../services/inovasi.service'

const empty = (): Config => ({ tahap1: [], tahap2: [], mappings: [] })
export default function TemplateAssessment() {
  const [list, setList] = useState<Package[]>([])
  const [nama, setNama] = useState('')
  const [config, setConfig] = useState<Config>(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState<number | null>(null)
  const load = async () => {
    try {
      setList((await packages()).data)
    } catch {
      setError(
        'Hanya admin yang dapat mengelola template. Buka melalui akun admin.',
      )
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const change = (value: Config) => {
    setConfig(value)
    setSaved(null)
  }
  const duplicate = (p: Package) => {
    setNama(`${p.nama} — versi baru`)
    change(structuredClone(p.config))
  }
  const importQuestions = async () => {
    const { data } = await getAssessmentQuestions()
    const rows: Question[] = data.flatMap((q: any) => [
      { id: q.id, pertanyaan: q.pertanyaan, parent_id: null },
      ...(q.children || []).map((c: any) => ({
        id: c.id,
        pertanyaan: c.pertanyaan,
        parent_id: q.id,
      })),
    ])
    change({ tahap1: rows, tahap2: structuredClone(rows), mappings: [] })
  }
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const { data } = await createPackage(nama, config)
      setSaved(data.id)
      await load()
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? e.response?.data?.message || e.message
          : 'Gagal menyimpan',
      )
    } finally {
      setBusy(false)
    }
  }
  const publish = async (id: number) => {
    if (
      !confirm(
        'Publikasikan paket ini? Isinya dikunci. Perubahan berikutnya harus melalui versi baru.',
      )
    )
      return
    setBusy(true)
    try {
      await publishPackage(id)
      await load()
    } catch (e) {
      setError(
        axios.isAxiosError(e)
          ? e.response?.data?.message || e.message
          : 'Gagal publikasi',
      )
    } finally {
      setBusy(false)
    }
  }
  const remove = (key: 'tahap1' | 'tahap2', id: number) => {
    const removed = new Set(
      config[key]
        .filter((q) => q.id === id || q.parent_id === id)
        .map((q) => q.id),
    )
    change({
      ...config,
      [key]: config[key].filter((q) => !removed.has(q.id)),
      mappings: config.mappings.filter(
        (m) =>
          !(
            (key === 'tahap1' &&
              (removed.has(m.source_id) ||
                (m.target_stage === 1 && removed.has(m.target_id)))) ||
            (key === 'tahap2' &&
              m.target_stage === 2 &&
              removed.has(m.target_id))
          ),
      ),
    })
  }
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">Template Assessment Dua Tahap</h2>
      <p className="text-sm text-gray-600">
        Self assessment memakai pertanyaan tahap 1. Jawaban review terpisah dan
        hanya terisi otomatis sesuai mapping. Versi yang dipakai usulan tetap
        tersimpan.
      </p>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      <div className="space-y-2 rounded-xl border bg-white p-4">
        {list.map((p) => (
          <div
            key={p.id}
            className="flex flex-wrap items-center gap-3 border-b py-2"
          >
            <span className="flex-1">
              #{p.id} {p.nama} —{' '}
              {p.published_at
                ? p.used_at
                  ? 'Dipakai • terkunci'
                  : 'Dipublikasikan • terkunci'
                : 'Draf'}
            </span>
            <button className="text-blue-700" onClick={() => duplicate(p)}>
              Duplikat / versi baru
            </button>
            {!p.published_at && (
              <button
                disabled={busy}
                className="text-green-700"
                onClick={() => void publish(p.id)}
              >
                Publikasikan
              </button>
            )}
          </div>
        ))}
      </div>
      <fieldset
        disabled={busy}
        className="space-y-4 rounded-xl border bg-white p-4"
      >
        <legend className="font-semibold">Susun versi baru</legend>
        <input
          aria-label="Nama paket"
          className="w-full rounded border p-2"
          placeholder="Nama paket / versi"
          value={nama}
          onChange={(e) => {
            setNama(e.target.value)
            setSaved(null)
          }}
        />
        <button
          className="rounded border px-3 py-2"
          onClick={() =>
            void importQuestions().catch(() =>
              setError('Gagal mengambil pertanyaan lama'),
            )
          }
        >
          Mulai dari pertanyaan yang sekarang
        </button>
        {(['tahap1', 'tahap2'] as const).map((key, index) => (
          <div key={key} className="space-y-2">
            <h3 className="font-semibold">
              {index === 0
                ? 'Self assessment dan review tahap 1'
                : 'Review tahap 2'}
            </h3>
            {ordered(config[key]).map((q) => (
              <div key={q.id} className="flex gap-2">
                <span className="w-12 py-2">{q.no}</span>
                <input
                  aria-label={`Pertanyaan ${key} ${q.no}`}
                  className="flex-1 rounded border p-2"
                  value={q.pertanyaan}
                  onChange={(e) =>
                    change({
                      ...config,
                      [key]: config[key].map((v) =>
                        v.id === q.id
                          ? { ...v, pertanyaan: e.target.value }
                          : v,
                      ),
                    })
                  }
                />
                <button
                  onClick={() => remove(key, q.id)}
                  className="text-red-600"
                >
                  Hapus
                </button>
                {q.parent_id === null && (
                  <button
                    onClick={() =>
                      change({
                        ...config,
                        [key]: [
                          ...config[key],
                          {
                            id:
                              Math.max(0, ...config[key].map((v) => v.id)) + 1,
                            pertanyaan: '',
                            parent_id: q.id,
                          },
                        ],
                      })
                    }
                  >
                    + Anak
                  </button>
                )}
              </div>
            ))}
            <button
              className="rounded border px-3 py-2"
              onClick={() =>
                change({
                  ...config,
                  [key]: [
                    ...config[key],
                    {
                      id: Math.max(0, ...config[key].map((q) => q.id)) + 1,
                      pertanyaan: '',
                      parent_id: null,
                    },
                  ],
                })
              }
            >
              + Pertanyaan utama
            </button>
          </div>
        ))}
        <h3 className="font-semibold">
          Copy seluruh baris (Ya/Tidak, Catatan, Link)
        </h3>
        {[1, 2].map((stage) => (
          <div key={stage}>
            <h4>Tujuan: review tahap {stage}</h4>
            {ordered(stage === 1 ? config.tahap1 : config.tahap2).map((q) => {
              const mapping = config.mappings.find(
                (m) => m.target_stage === stage && m.target_id === q.id,
              )
              return (
                <label key={q.id} className="my-2 flex items-center gap-3">
                  <span className="w-1/2">
                    {q.no}. {q.pertanyaan}
                  </span>
                  <select
                    className="w-1/2 rounded border p-2"
                    value={
                      mapping
                        ? `${mapping.source_stage}:${mapping.source_id}`
                        : ''
                    }
                    onChange={(e) => {
                      const mappings = config.mappings.filter(
                        (m) =>
                          !(m.target_stage === stage && m.target_id === q.id),
                      )
                      if (e.target.value) {
                        const [source_stage, source_id] = e.target.value
                          .split(':')
                          .map(Number)
                        mappings.push({
                          source_stage,
                          source_id,
                          target_stage: stage,
                          target_id: q.id,
                        })
                      }
                      change({ ...config, mappings })
                    }}
                  >
                    <option value="">Kosong — tanpa copy</option>
                    {(stage === 1 ? [0] : [0, 1]).flatMap((source) =>
                      ordered(config.tahap1).map((row) => (
                        <option
                          key={`${source}:${row.id}`}
                          value={`${source}:${row.id}`}
                        >
                          {source === 0 ? 'Self assessment' : 'Review tahap 1'}:{' '}
                          {row.no}. {row.pertanyaan}
                        </option>
                      )),
                    )}
                  </select>
                </label>
              )
            })}
          </div>
        ))}
        <button
          className="rounded bg-blue-600 px-4 py-2 text-white"
          onClick={() => void save()}
        >
          Simpan sebagai draf baru
        </button>
        {saved && (
          <span className="ml-3 text-green-700">
            Draf #{saved} tersimpan. Publikasikan melalui daftar di atas.
          </span>
        )}
      </fieldset>
    </div>
  )
}
