import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  packages,
  createPackage,
  publishPackage,
} from '../../services/workflow.service'
import type { Package, Config, Question } from '../../services/workflow.service'
import {
  removeTemplateStage,
  removeTemplateQuestion,
} from '../../utils/templateConfig'
import { getAssessmentQuestions } from '../../services/inovasi.service'

const empty = (): Config => ({
  stages: [{ nama: 'Tahap 1', questions: [] }],
  mappings: [],
})
export default function TemplateAssessment() {
  const [list, setList] = useState<Package[]>([])
  const [nama, setNama] = useState('')
  const [config, setConfig] = useState<Config>(empty)
  const [stageIndex, setStageIndex] = useState(0)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modal, setModal] = useState<{
    editing: Question | null
    parent_id: number | null
    text: string
  } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Question | null>(null)
  const questions = config.stages[stageIndex]?.questions || []
  const stageNumber = stageIndex + 1
  const load = async () => {
    try {
      setList((await packages()).data)
    } catch {
      setError(
        'Gagal memuat template. Pengaturan ini hanya tersedia bagi admin.',
      )
    }
  }
  useEffect(() => {
    void load()
  }, [])
  const change = (value: Config) => {
    if (locked) return
    setConfig(value)
    setSelectedId(null)
    setNotice('')
  }
  const choose = (id: string) => {
    const pack = list.find((p) => p.id === Number(id))
    setSelectedId(pack?.id ?? null)
    setNama(pack?.nama ?? '')
    setConfig(pack ? structuredClone(pack.config) : empty())
    setLocked(!!pack?.published_at)
    setStageIndex(0)
    setNotice('')
    setError('')
  }
  const newVersion = () => {
    setLocked(false)
    setSelectedId(null)
    setNama(nama ? `${nama} — versi baru` : '')
    setNotice('Salinan siap diedit. Paket sebelumnya tetap tersimpan.')
  }
  const importQuestions = async () => {
    if (
      questions.length &&
      !confirm(
        'Ganti pertanyaan tahap ini dengan daftar pertanyaan sebelumnya? Mapping yang terkait akan dihapus.',
      )
    )
      return
    try {
      const { data } = await getAssessmentQuestions()
      const rows: Question[] = data.flatMap((q: any) => [
        { id: q.id, pertanyaan: q.pertanyaan, parent_id: null },
        ...(q.children || []).map((c: any) => ({
          id: c.id,
          pertanyaan: c.pertanyaan,
          parent_id: q.id,
        })),
      ])
      const stages = config.stages.map((s, i) =>
        i === stageIndex ? { ...s, questions: rows } : s,
      )
      const mappings = config.mappings.filter(
        (m) =>
          m.target_stage !== stageNumber &&
          m.source_stage !== stageNumber &&
          !(stageNumber === 1 && m.source_stage === 0),
      )
      change({ stages, mappings })
    } catch {
      setError('Gagal mengambil pertanyaan sebelumnya')
    }
  }
  const save = async () => {
    setBusy(true)
    setError('')
    try {
      const { data } = await createPackage(nama, config)
      setSelectedId(data.id)
      setConfig(data.config)
      setNotice('Draf tersimpan. Publikasikan jika konfigurasi sudah sesuai.')
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
  const publish = async () => {
    if (
      !selectedId ||
      !confirm(
        'Publikasikan paket ini? Template akan dikunci. Perubahan berikutnya melalui versi baru.',
      )
    )
      return
    setBusy(true)
    setError('')
    try {
      await publishPackage(selectedId)
      setLocked(true)
      setNotice('Template dipublikasikan dan terkunci.')
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
  const saveQuestion = () => {
    if (!modal?.text.trim()) return
    const row: Question = {
      id: modal.editing?.id ?? Math.max(0, ...questions.map((q) => q.id)) + 1,
      pertanyaan: modal.text.trim(),
      parent_id: modal.parent_id,
    }
    const next = modal.editing
      ? questions.map((q) => (q.id === row.id ? row : q))
      : [...questions, row]
    change({
      ...config,
      stages: config.stages.map((s, i) =>
        i === stageIndex ? { ...s, questions: next } : s,
      ),
    })
    setModal(null)
  }
  const removeQuestion = () => {
    if (!deleteTarget) return
    change(removeTemplateQuestion(config, stageIndex, deleteTarget.id))
    setDeleteTarget(null)
  }
  const removeStage = () => {
    if (
      config.stages.length === 1 ||
      !confirm(
        `Hapus ${config.stages[stageIndex].nama} beserta pertanyaan dan mapping terkait?`,
      )
    )
      return
    change(removeTemplateStage(config, stageIndex))
    setStageIndex(Math.max(0, stageIndex - 1))
  }
  const mapping = (q: Question) => {
    const m = config.mappings.find(
      (m) => m.target_stage === stageNumber && m.target_id === q.id,
    )
    return (
      <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>Salin seluruh baris dari</span>
        <select
          disabled={locked || busy}
          aria-label={`Sumber copy ${q.pertanyaan}`}
          className="max-w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-gray-700"
          value={m ? `${m.source_stage}:${m.source_id}` : ''}
          onChange={(e) => {
            const mappings = config.mappings.filter(
              (v) => !(v.target_stage === stageNumber && v.target_id === q.id),
            )
            if (e.target.value) {
              const [source_stage, source_id] = e.target.value
                .split(':')
                .map(Number)
              mappings.push({
                source_stage,
                source_id,
                target_stage: stageNumber,
                target_id: q.id,
              })
            }
            change({ ...config, mappings })
          }}
        >
          <option value="">Tidak disalin / mulai kosong</option>
          {Array.from({ length: stageNumber }, (_, source) =>
            (source === 0
              ? config.stages[0].questions
              : config.stages[source - 1].questions
            ).map((row) => (
              <option key={`${source}:${row.id}`} value={`${source}:${row.id}`}>
                {source === 0
                  ? 'Self assessment'
                  : config.stages[source - 1].nama}
                : {row.pertanyaan}
              </option>
            )),
          )}
        </select>
      </label>
    )
  }
  const actions = (q: Question) => (
    <div className="ml-4 flex shrink-0 gap-1">
      <button
        disabled={locked || busy}
        title="Edit"
        className="rounded-lg px-2 py-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600 disabled:opacity-30"
        onClick={() =>
          setModal({ editing: q, parent_id: q.parent_id, text: q.pertanyaan })
        }
      >
        Edit
      </button>
      <button
        disabled={locked || busy}
        title="Hapus"
        className="rounded-lg px-2 py-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
        onClick={() => setDeleteTarget(q)}
      >
        Hapus
      </button>
    </div>
  )
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            Management BA Inovasi
          </h2>
          <p className="text-sm text-gray-500">
            Kelola tahapan, hierarki pertanyaan, dan aturan copy assessment
          </p>
        </div>
        <button
          disabled={locked || busy}
          className="rounded-lg bg-violet-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"
          onClick={() => setModal({ editing: null, parent_id: null, text: '' })}
        >
          + Tambah Pertanyaan Utama
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg bg-violet-50 px-4 py-3 text-sm text-violet-700"
        >
          {notice}
        </div>
      )}
      <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <select
            aria-label="Pilih versi template"
            className="min-w-56 flex-1 rounded-lg border px-3 py-2 text-sm"
            value={selectedId || ''}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="">Paket / versi baru</option>
            {list.map((p) => (
              <option value={p.id} key={p.id}>
                #{p.id} {p.nama} •{' '}
                {p.published_at ? 'Terpublikasi / terkunci' : 'Draf'}
              </option>
            ))}
          </select>
          <button
            className="rounded-lg border px-3 py-2 text-sm text-gray-600"
            disabled={busy}
            onClick={newVersion}
          >
            Duplikat / Versi Baru
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          <input
            aria-label="Nama paket template"
            placeholder="Nama paket / versi template"
            className="flex-1 rounded-lg border px-3 py-2 text-sm"
            disabled={locked || busy}
            value={nama}
            onChange={(e) => {
              setNama(e.target.value)
              setSelectedId(null)
            }}
          />
          <button
            disabled={locked || busy}
            onClick={() => void save()}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            Simpan Draf
          </button>
          <button
            disabled={locked || busy || !selectedId}
            onClick={() => void publish()}
            className="rounded-lg border border-violet-200 px-4 py-2 text-sm text-violet-700 disabled:opacity-40"
          >
            Publikasikan
          </button>
        </div>
        {locked && (
          <p className="text-xs text-gray-500">
            Template ini sudah dipublikasikan dan terkunci. Duplikasikan untuk
            membuat versi baru.
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {config.stages.map((s, i) => (
          <button
            key={i}
            onClick={() => setStageIndex(i)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium ${i === stageIndex ? 'border-violet-600 bg-violet-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
          >
            {s.nama || `Tahap ${i + 1}`}
          </button>
        ))}
        <button
          disabled={locked || busy}
          className="rounded-lg border border-dashed border-violet-300 px-4 py-2 text-sm text-violet-600 disabled:opacity-30"
          onClick={() => {
            change({
              ...config,
              stages: [
                ...config.stages,
                { nama: `Tahap ${config.stages.length + 1}`, questions: [] },
              ],
            })
            setStageIndex(config.stages.length)
          }}
        >
          + Tambah Tahap
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-5 py-4">
        <label className="flex items-center gap-3 text-sm text-gray-600">
          Nama tahap
          <input
            aria-label="Nama tahap"
            className="rounded-lg border px-3 py-2"
            disabled={locked || busy}
            value={config.stages[stageIndex].nama}
            onChange={(e) =>
              change({
                ...config,
                stages: config.stages.map((s, i) =>
                  i === stageIndex ? { ...s, nama: e.target.value } : s,
                ),
              })
            }
          />
        </label>
        <button
          disabled={locked || busy}
          className="text-sm text-violet-600 disabled:opacity-30"
          onClick={() => void importQuestions()}
        >
          Gunakan Pertanyaan Sebelumnya
        </button>
        <button
          disabled={locked || busy || config.stages.length === 1}
          className="ml-auto text-sm text-red-600 disabled:opacity-30"
          onClick={removeStage}
        >
          Hapus Tahap
        </button>
      </div>
      <p className="text-xs text-gray-500">
        {stageIndex === 0
          ? 'Pertanyaan tahap pertama juga dipakai untuk self assessment satker. '
          : ''}
        Aturan copy menyalin Ya/Tidak, Catatan, dan Link saat tahap pertama kali
        dibuat.
      </p>
      {questions.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-20 text-center">
          <h3 className="font-semibold text-gray-600">Belum Ada Pertanyaan</h3>
          <p className="mt-1 text-sm text-gray-400">
            Tambahkan pertanyaan utama atau gunakan pertanyaan sebelumnya.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {questions
            .filter((q) => q.parent_id === null)
            .map((parent, index) => (
              <div
                key={parent.id}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex items-start justify-between bg-gray-50/80 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex gap-3 font-bold text-gray-800">
                      <span>{index + 1}.</span>
                      <span>{parent.pertanyaan}</span>
                    </div>
                    {mapping(parent)}
                  </div>
                  <button
                    disabled={locked || busy}
                    className="ml-3 rounded-lg p-2 text-violet-600 hover:bg-violet-100 disabled:opacity-30"
                    title="Tambah Sub-Pertanyaan"
                    onClick={() =>
                      setModal({
                        editing: null,
                        parent_id: parent.id,
                        text: '',
                      })
                    }
                  >
                    +
                  </button>
                  {actions(parent)}
                </div>
                <div className="divide-y divide-gray-100">
                  {questions
                    .filter((q) => q.parent_id === parent.id)
                    .map((child, childIndex) => (
                      <div
                        key={child.id}
                        className="flex items-start justify-between border-t border-gray-100 px-6 py-3 pl-14 hover:bg-gray-50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex gap-3 text-gray-600">
                            <span>{String.fromCharCode(97 + childIndex)}.</span>
                            <span>{child.pertanyaan}</span>
                          </div>
                          {mapping(child)}
                        </div>
                        {actions(child)}
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setModal(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Pertanyaan assessment"
            className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-800">
                {modal.editing
                  ? 'Edit Pertanyaan'
                  : modal.parent_id
                    ? 'Tambah Sub-Pertanyaan'
                    : 'Tambah Pertanyaan Utama'}
              </h2>
              <button aria-label="Tutup" onClick={() => setModal(null)}>
                ×
              </button>
            </div>
            <label className="block text-sm font-medium text-gray-700">
              Pertanyaan <span className="text-red-500">*</span>
              <textarea
                autoFocus
                rows={4}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 focus:border-violet-500"
                value={modal.text}
                onChange={(e) => setModal({ ...modal, text: e.target.value })}
              />
            </label>
            <div className="mt-6 flex justify-end gap-3">
              <button
                className="rounded-lg border px-4 py-2 text-sm text-gray-600"
                onClick={() => setModal(null)}
              >
                Batal
              </button>
              <button
                disabled={!modal.text.trim()}
                className="rounded-lg bg-violet-600 px-4 py-2 text-sm text-white disabled:opacity-40"
                onClick={saveQuestion}
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Hapus Pertanyaan"
            className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
          >
            <h2 className="mb-2 text-lg font-semibold text-gray-800">
              Hapus Pertanyaan
            </h2>
            <p className="text-sm text-gray-500">
              Hapus pertanyaan ini beserta sub-pertanyaan dan mapping terkait?
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setDeleteTarget(null)}
              >
                Batal
              </button>
              <button
                className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
                onClick={removeQuestion}
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
