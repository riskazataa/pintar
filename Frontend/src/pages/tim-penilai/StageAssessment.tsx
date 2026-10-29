import { useEffect, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import axios from 'axios'
import {
  getUsulanList,
  getAkunTimPenilai,
} from '../../services/inovasi.service'
import {
  workflowAction,
  workflowDetail,
  ordered,
} from '../../services/workflow.service'
import type {
  Answer,
  Detail,
  Workflow,
  Question,
} from '../../services/workflow.service'
import { exportToExcel } from '../../utils/resultExcel'

function account(): { id: number; role: string } {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}')
  } catch {
    return { id: 0, role: '' }
  }
}
function ReadOnlyAssessment({
  questions,
  answers,
}: {
  questions: Question[]
  answers: Answer[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="my-3 w-full text-sm">
        <thead>
          <tr>
            <th>Kriteria</th>
            <th>Ya/Tidak</th>
            <th>Catatan</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>
          {ordered(questions).map((q) => {
            const a = answers.find((v) => v.question_id === q.id)
            return (
              <tr className="border-t" key={q.id}>
                <td className="p-2">
                  {q.no}. {q.pertanyaan}
                </td>
                <td className="p-2">
                  {a?.jawaban_boolean == null
                    ? 'Belum diisi'
                    : a.jawaban_boolean
                      ? 'Ya'
                      : 'Tidak'}
                </td>
                <td className="p-2">{a?.catatan_string || '-'}</td>
                <td className="p-2">
                  {a?.link && (
                    <a
                      className="text-blue-700 underline"
                      href={a.link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Bukti
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
export default function StageAssessment({
  stage = 1,
  resultsOnly = false,
  inovasiId,
  onBack,
}: {
  stage?: number
  inovasiId?: number
  onBack?: () => void
  resultsOnly?: boolean
}) {
  const user = account()
  const admin = user.role === 'SUPER_ADMIN'
  const satker = user.role === 'SATKER'
  const [list, setList] = useState<
    { id: number; judul: string; workflow: Workflow | null }[]
  >([])
  const [detail, setDetail] = useState<Detail | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [selected, setSelected] = useState<number[]>([])
  const [reviewers, setReviewers] = useState<
    { id: number; nama_lengkap: string }[]
  >([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reason, setReason] = useState('')
  const [nip, setNip] = useState('')
  const [jabatan, setJabatan] = useState('')
  const [dirty, setDirty] = useState(false)
  const pad = useRef<SignatureCanvas>(null)
  const update = (value: Detail) => {
    if (!value.workflow.stages[stage - 1])
      throw new Error('Tahap tidak tersedia untuk inovasi ini')
    setDetail(value)
    setAnswers(structuredClone(value.workflow.stages[stage - 1].answers))
    setDirty(false)
    setSelected([])
  }
  const load = async () => {
    setLoading(true)
    try {
      const first = await getUsulanList({
        page: 1,
        limit: 100,
        assignedToMe: !admin && !satker ? true : undefined,
      })
      let items = first.data.data ?? first.data
      const total = first.data.meta?.total_pages || 1
      for (let page = 2; page <= total; page++) {
        const response = await getUsulanList({
          page,
          limit: 100,
          assignedToMe: !admin && !satker ? true : undefined,
        })
        items = [...items, ...response.data.data]
      }
      setList(items)
    } catch {
      setError('Gagal memuat daftar assessment')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    setDetail(null)
    if (inovasiId) void open(inovasiId)
    else void load()
    if (admin)
      getAkunTimPenilai()
        .then((r) => setReviewers(r.data.data ?? r.data))
        .catch(() => setError('Gagal memuat akun reviewer'))
  }, [stage, resultsOnly, inovasiId])
  const open = async (id: number) => {
    setBusy(true)
    setError('')
    try {
      update((await workflowDetail(id)).data)
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
      setLoading(false)
    }
  }
  const showError = (e: unknown) =>
    setError(
      axios.isAxiosError(e)
        ? e.response?.data?.message || e.message
        : e instanceof Error
          ? e.message
          : 'Terjadi kesalahan',
    )
  const action = async (name: string, payload: object) => {
    if (!detail) return
    setBusy(true)
    setError('')
    try {
      update(
        (
          await workflowAction(
            detail.id,
            stage,
            name,
            detail.workflow.revision,
            payload,
          )
        ).data,
      )
      if (!inovasiId) await load()
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }
  const s = detail?.workflow.stages[stage - 1]
  const own = s?.signatures.find((sig) => sig.user_id === Number(user.id))
  const active = detail?.workflow.active === stage && !s?.result
  const assigned = s?.reviewer_ids.includes(Number(user.id))
  const editable = active && assigned && s?.signatures.length === 0
  const rows = detail?.workflow.config.stages[stage - 1]?.questions || []
  const status = (result: string | null | undefined) =>
    result === 'LOLOS'
      ? 'Lolos'
      : result === 'TIDAK_LOLOS'
        ? 'Tidak Lolos'
        : 'Belum selesai'
  const badge = (result: string | null | undefined) =>
    `rounded px-3 py-1 text-sm ${result === 'LOLOS' ? 'bg-green-100 text-green-800' : result === 'TIDAK_LOLOS' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`
  const patch = (id: number, change: Partial<Answer>) => {
    setDirty(true)
    setAnswers((prev) =>
      prev.map((a) => (a.question_id === id ? { ...a, ...change } : a)),
    )
  }
  const exportResult = async () => {
    if (!detail || !s?.result) return
    setBusy(true)
    try {
      await exportToExcel({
        ...detail,
        stage_number: stage,
        assessment_answers: s.answers.map((a) => ({
          ...a,
          question: rows.find((q) => q.id === a.question_id),
        })),
        signatures: s.signatures,
      })
    } catch (e) {
      showError(e)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">
        {resultsOnly ? 'Hasil' : 'Assessment'} {detail?.workflow.config.stages[stage - 1]?.nama || `Tahap ${stage}`}
      </h2>
      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {!detail ? (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <button
            className="rounded border px-3 py-2"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Muat ulang
          </button>
          {loading ? (
            <p>Memuat assessment…</p>
          ) : list.filter(
              (item) =>
                item.workflow &&
                (!resultsOnly || item.workflow.stages[stage - 1]?.result),
            ).length === 0 ? (
            <p>
              Belum ada{' '}
              {resultsOnly
                ? 'hasil final'
                : 'usulan dengan template assessment'}
              . Admin perlu memublikasikan paket template sebelum satker
              mengajukan usulan baru.
            </p>
          ) : null}
          {list
            .filter(
              (item) =>
                item.workflow &&
                (!resultsOnly || item.workflow.stages[stage - 1]?.result),
            )
            .map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 border-b py-3"
              >
                <span className="flex-1">{item.judul}</span>
                <span
                  className={badge(item.workflow?.stages[stage - 1]?.result)}
                >
                  {status(item.workflow?.stages[stage - 1]?.result)}
                </span>
                <button
                  disabled={busy}
                  className="text-blue-700"
                  onClick={() => void open(item.id)}
                >
                  Buka tahap {stage}
                </button>
              </div>
            ))}
          {stage === 1 &&
            !admin &&
            !satker &&
            list.some((i) => !i.workflow) && (
              <a
                className="block text-blue-700"
                href="/tim-penilai/tahap-1/legacy"
              >
                Buka usulan lama
              </a>
            )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
            <button
              onClick={() => {
                if (!dirty || confirm('Abaikan perubahan yang belum disimpan?'))
                  onBack ? onBack() : setDetail(null)
              }}
            >
              ← Daftar
            </button>
            <h3 className="flex-1 font-semibold">{detail.judul}</h3>
            <span className={badge(s?.result)}>{status(s?.result)}</span>
            <button
              disabled={busy}
              onClick={() => {
                if (
                  !dirty ||
                  confirm('Muat ulang dan abaikan perubahan lokal?')
                )
                  void open(detail.id)
              }}
            >
              Muat ulang
            </button>
          </div>
          <p className="text-sm text-gray-600">
            {detail.satker.nama_satker} • {detail.template} • Putaran{' '}
            {detail.workflow.round} •{' '}
            {detail.workflow.active === 0
              ? 'Perbaikan self assessment satker'
              : `Tahap aktif: ${detail.workflow.active}`}
          </p>
          {detail.catatan_perbaikan && (
            <p className="rounded bg-blue-50 p-3">
              Alasan perbaikan: {detail.catatan_perbaikan}
            </p>
          )}
          {admin && s?.reviewer_ids.length === 0 && (
            <fieldset
              disabled={busy}
              className="space-y-2 rounded-xl border bg-white p-4"
            >
              <legend>Tetapkan reviewer tahap {stage} (permanen)</legend>
              {reviewers.map((r) => (
                <label key={r.id} className="mr-4 inline-flex gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.id)}
                    onChange={(e) =>
                      setSelected((prev) =>
                        e.target.checked
                          ? [...prev, r.id]
                          : prev.filter((id) => id !== r.id),
                      )
                    }
                  />
                  {r.nama_lengkap}
                </label>
              ))}
              <button
                className="block rounded bg-blue-600 px-3 py-2 text-white"
                disabled={!selected.length}
                onClick={() => {
                  if (
                    confirm(
                      'Reviewer tidak dapat diganti setelah ditetapkan. Lanjutkan?',
                    )
                  )
                    void action('assign', { reviewer_ids: selected })
                }}
              >
                Tetapkan reviewer
              </button>
            </fieldset>
          )}
          <details className="rounded-xl border bg-white p-4">
            <summary>Self assessment asli satker</summary>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr>
                  <th>Kriteria</th>
                  <th>Ya/Tidak</th>
                  <th>Catatan</th>
                  <th>Link</th>
                </tr>
              </thead>
              <tbody>
                {ordered(detail.workflow.config.stages[0].questions).map(
                  (q) => {
                    const a = detail.workflow.self.find(
                      (a) => a.question_id === q.id,
                    )
                    return (
                      <tr key={q.id}>
                        <td className="p-2">
                          {q.no}. {q.pertanyaan}
                        </td>
                        <td>{a?.jawaban_boolean ? 'Ya' : 'Tidak'}</td>
                        <td>{a?.catatan_string}</td>
                        <td>
                          {a?.link && (
                            <a
                              className="text-blue-700 underline"
                              href={a.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Bukti
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  },
                )}
              </tbody>
            </table>
          </details>
          {!s?.created ? (
            <p>
              Tahap ini akan dibuat setelah tahap sebelumnya Lolos. Reviewer
              tahap 2 dapat ditetapkan lebih dahulu.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border bg-white p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-2">No</th>
                    <th className="p-2">Kriteria Penilaian</th>
                    <th className="p-2">Ya/Tidak</th>
                    <th className="p-2">Catatan</th>
                    <th className="p-2">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {ordered(rows).map((q) => {
                    const a = answers.find((a) => a.question_id === q.id)
                    return (
                      <tr className="border-t" key={q.id}>
                        <td className="p-2">{q.no}</td>
                        <td
                          className={`min-w-52 p-2 ${q.parent_id === null ? 'font-semibold' : 'pl-6'}`}
                        >
                          {q.pertanyaan}
                        </td>
                        <td className="p-2">
                          <select
                            aria-label={`Jawaban ${q.no}`}
                            disabled={!editable || busy}
                            value={
                              a?.jawaban_boolean == null
                                ? ''
                                : String(a.jawaban_boolean)
                            }
                            onChange={(e) =>
                              patch(q.id, {
                                jawaban_boolean:
                                  e.target.value === ''
                                    ? null
                                    : e.target.value === 'true',
                              })
                            }
                          >
                            <option value="">Pilih</option>
                            <option value="true">Ya</option>
                            <option value="false">Tidak</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <textarea
                            aria-label={`Catatan ${q.no}`}
                            className="rounded border p-2"
                            disabled={!editable || busy}
                            value={a?.catatan_string || ''}
                            onChange={(e) =>
                              patch(q.id, { catatan_string: e.target.value })
                            }
                          />
                        </td>
                        <td className="p-2">
                          <input
                            aria-label={`Link ${q.no}`}
                            type="url"
                            className="rounded border p-2"
                            disabled={!editable || busy}
                            value={a?.link || ''}
                            onChange={(e) =>
                              patch(q.id, { link: e.target.value })
                            }
                          />
                          {a?.link && (
                            <a
                              className="block text-blue-700"
                              href={a.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Buka link
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {editable && (
                <button
                  disabled={busy || !dirty}
                  className="mt-3 rounded bg-blue-600 px-4 py-2 text-white"
                  onClick={() => void action('answers', { answers })}
                >
                  Simpan isian bersama
                </button>
              )}
              {!!s.signatures.length && (
                <p className="mt-3 text-sm text-gray-600">
                  Isian dikunci sejak tanda tangan pertama.
                </p>
              )}
            </div>
          )}
          <div className="space-y-3 rounded-xl border bg-white p-4">
            <h3 className="font-semibold">
              Reviewer, tanda tangan, dan keputusan
            </h3>
            {s?.reviewer_ids.map((id) => {
              const sig = s.signatures.find((v) => v.user_id === id)
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-center gap-3 border-b py-2"
                >
                  <span className="flex-1">
                    {detail.reviewers.find((r) => r.id === id)?.nama_lengkap ||
                      id}
                  </span>
                  {sig && (
                    <img
                      className="h-12 w-28 object-contain"
                      src={sig.ttd_image}
                      alt={`Tanda tangan ${sig.nama}`}
                    />
                  )}
                  <span>
                    {sig
                      ? sig.vote === null
                        ? sig.voted
                          ? 'Keputusan sudah dikirim'
                          : 'Sudah tanda tangan'
                        : sig.vote
                          ? 'Lolos'
                          : 'Tidak Lolos'
                      : 'Belum tanda tangan'}
                  </span>
                </div>
              )
            })}
            {s?.result && (
              <p>
                Lolos: {s.signatures.filter((v) => v.vote === true).length} •
                Tidak Lolos:{' '}
                {s.signatures.filter((v) => v.vote === false).length} •
                Mayoritas: {status(s.result)}
              </p>
            )}
            {active && assigned && !own && (
              <fieldset disabled={busy || dirty} className="space-y-3">
                <legend>Tanda tangan Anda</legend>
                <input
                  className="rounded border p-2"
                  placeholder="Jabatan"
                  aria-label="Jabatan"
                  value={jabatan}
                  onChange={(e) => setJabatan(e.target.value)}
                />
                <input
                  className="ml-2 rounded border p-2"
                  placeholder="NIP"
                  aria-label="NIP"
                  value={nip}
                  onChange={(e) => setNip(e.target.value)}
                />
                <SignatureCanvas
                  ref={pad}
                  penColor="black"
                  canvasProps={{
                    width: 400,
                    height: 150,
                    className: 'max-w-full border rounded bg-white',
                  }}
                />
                <button onClick={() => pad.current?.clear()}>Bersihkan</button>
                <button
                  className="ml-3 rounded bg-blue-600 px-3 py-2 text-white"
                  onClick={() => {
                    if (!pad.current || pad.current.isEmpty())
                      return setError('Buat tanda tangan terlebih dahulu')
                    void action('sign', {
                      nip,
                      jabatan,
                      signature_data: pad.current
                        .getCanvas()
                        .toDataURL('image/png'),
                    })
                  }}
                >
                  Simpan tanda tangan
                </button>
                {dirty && <p>Simpan isian sebelum tanda tangan.</p>}
              </fieldset>
            )}
            {active && own && own.vote === null && (
              <fieldset disabled={busy} className="space-x-3">
                <legend className="mb-2 font-semibold">
                  Tanda tangan tersimpan. Pilih keputusan Anda:
                </legend>
                <button
                  className="rounded bg-green-600 px-4 py-2 text-white"
                  onClick={() => {
                    if (
                      confirm(
                        'Kirim keputusan Lolos? Pilihan tidak dapat diubah.',
                      )
                    )
                      void action('vote', { lolos: true })
                  }}
                >
                  Lolos
                </button>
                <button
                  className="rounded bg-red-600 px-4 py-2 text-white"
                  onClick={() => {
                    if (
                      confirm(
                        'Kirim keputusan Tidak Lolos? Pilihan tidak dapat diubah.',
                      )
                    )
                      void action('vote', { lolos: false })
                  }}
                >
                  Tidak Lolos
                </button>
              </fieldset>
            )}
            {s?.result && (
              <button
                disabled={busy}
                className="rounded border border-green-600 px-4 py-2 text-green-700"
                onClick={() => void exportResult()}
              >
                Ekspor Excel tahap {stage}
              </button>
            )}
          </div>
          {((active && assigned) ||
            (admin && detail.workflow.active !== 0)) && (
            <fieldset
              disabled={busy}
              className="space-y-3 rounded-xl border bg-white p-4"
            >
              <legend>
                {admin
                  ? 'Buka ulang / kembalikan ke self assessment'
                  : 'Kembalikan ke self assessment'}
              </legend>
              <textarea
                className="w-full rounded border p-2"
                aria-label="Alasan pengembalian"
                placeholder="Alasan wajib diisi"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                className="rounded bg-amber-600 px-4 py-2 text-white"
                disabled={!reason.trim()}
                onClick={() => {
                  if (
                    confirm(
                      'Kembalikan ke satker dan reset seluruh tanda tangan serta suara semua tahap? Isian draf dan riwayat tetap disimpan.',
                    )
                  )
                    void action('return', { reason })
                }}
              >
                Kembalikan ke satker
              </button>
            </fieldset>
          )}
          <details className="rounded-xl border bg-white p-4">
            <summary>
              Riwayat pengembalian ({detail.workflow.history.length})
            </summary>
            {detail.workflow.history.map((h) => (
              <div className="border-b py-3" key={h.round}>
                <p>
                  Putaran {h.round} • {new Date(h.at).toLocaleString('id-ID')}
                </p>
                <p>{h.reason}</p>
                <details>
                  <summary>Self assessment putaran ini</summary>
                  <ReadOnlyAssessment
                    questions={detail.workflow.config.stages[0].questions}
                    answers={h.self}
                  />
                </details>
                {h.stages.map((old, i) => (
                  <details key={i}>
                    <summary>
                      Tahap {i + 1}: {status(old.result)} •{' '}
                      {old.signatures.length} tanda tangan diarsipkan
                    </summary>
                    <ReadOnlyAssessment
                      questions={detail.workflow.config.stages[i].questions}
                      answers={old.answers}
                    />
                    {old.signatures.map((sig) => (
                      <div key={sig.user_id}>
                        {sig.nama} • NIP {sig.nip}
                        {old.result &&
                          (sig.vote === true ? ' • Lolos' : ' • Tidak Lolos')}
                        <img
                          className="h-12"
                          src={sig.ttd_image}
                          alt="Tanda tangan arsip"
                        />
                      </div>
                    ))}
                  </details>
                ))}
              </div>
            ))}
          </details>
        </>
      )}
    </div>
  )
}
