import type { BAColumn } from '../../services/inovasi.service'
import { useEffect, useRef, useState } from 'react'
import { getReviewerStageName } from '../../utils/tahap-reviewer'
import { CONCLUSION_MARKER, CONCLUSION_OPTIONS, conclusionText } from '../../utils/ba-conclusion'

function getClickableUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim() || value.trim().startsWith('/')) return null
  const rawUrl = value.trim()
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`)
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

export default function BAAnswerGrid({ answers, columns, values, disabled, onChange, questionTitle: _questionTitle, satkerMode = false, showRequiredErrors = false }: {
  satkerMode?: boolean
  questionTitle?: string
  answers: any[]
  columns: BAColumn[]
  values: Record<string, any>
  disabled: boolean
  onChange: (id: string, value: any) => void
  showRequiredErrors?: boolean
}) {
  const scrollArea = useRef<HTMLDivElement>(null)
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false)
  const [hasMoreColumns, setHasMoreColumns] = useState(false)

  useEffect(() => {
    const element = scrollArea.current
    if (!element) return

    const updateScrollHint = () => {
      setHasHorizontalOverflow(element.scrollWidth > element.clientWidth + 1)
      setHasMoreColumns(element.scrollLeft + element.clientWidth < element.scrollWidth - 1)
    }

    updateScrollHint()
    element.addEventListener('scroll', updateScrollHint, { passive: true })
    const observer = new ResizeObserver(updateScrollHint)
    observer.observe(element)
    if (element.firstElementChild) observer.observe(element.firstElementChild)

    return () => {
      element.removeEventListener('scroll', updateScrollHint)
      observer.disconnect()
    }
  }, [answers.length, columns.length])

  const roots = answers.filter((answer) => !answer.question?.parent_id)
  const rows: { answer: any; no: string }[] = []
  let sectionNumber = 0
  for (const parent of roots) {
    if (parent.question?.is_header) sectionNumber = 0
    else sectionNumber += 1
    rows.push({ answer: parent, no: parent.question?.is_header ? '' : `${sectionNumber}.` })
    answers.filter((answer) => answer.question?.parent_id === parent.question_id)
      .forEach((answer, childIndex) => rows.push({ answer, no: parent.question?.is_header ? `${childIndex + 1}.` : `${sectionNumber}.${String.fromCharCode(97 + childIndex)}.` }))
  }
  return <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
    <div className="flex min-h-10 items-center justify-end border-b border-gray-100 px-3">
      {hasHorizontalOverflow && (
        <button
          type="button"
          onClick={() => {
            const distance = Math.max(240, (scrollArea.current?.clientWidth ?? 0) * 0.7)
            scrollArea.current?.scrollBy({ left: hasMoreColumns ? distance : -distance, behavior: 'smooth' })
          }}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          {hasMoreColumns ? 'Lihat kolom di kanan' : 'Geser ke kiri untuk kembali'}
          <span aria-hidden="true" className="text-base leading-none">{hasMoreColumns ? '→' : '←'}</span>
        </button>
      )}
    </div>
    <div ref={scrollArea} className="relative overflow-x-auto overscroll-x-contain">
    <table className="w-max min-w-full table-fixed text-left text-sm">
    <tbody>{rows.map(({ answer, no }) => answer.question?.question_title_override === CONCLUSION_MARKER ? <tr key={answer.id} className="border-t"><td colSpan={columns.length + 2} className="space-y-3 p-3"><p className="font-bold">{answer.question.pertanyaan}</p>{disabled || satkerMode ? <p className="whitespace-pre-wrap">{conclusionText(values[answer.id] ?? answer)}</p> : <><select aria-label="Kesimpulan penilaian akhir" className="w-full rounded-lg border p-2" value={(values[answer.id] ?? answer).custom_values?.__kesimpulan ?? ''} onChange={(event) => { const row = values[answer.id] ?? answer; onChange(String(answer.id), { ...row, custom_values: { ...row.custom_values, __kesimpulan: event.target.value } }) }}><option value="">Pilih kesimpulan</option>{CONCLUSION_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select>{(values[answer.id] ?? answer).custom_values?.__kesimpulan === 'Lainnya' && <textarea aria-label="Catatan kesimpulan lainnya" placeholder="Isi catatan kesimpulan lainnya" className="w-full rounded-lg border p-2" rows={3} value={(values[answer.id] ?? answer).custom_values?.__kesimpulan_catatan ?? ''} onChange={(event) => { const row = values[answer.id] ?? answer; onChange(String(answer.id), { ...row, custom_values: { ...row.custom_values, __kesimpulan_catatan: event.target.value } }) }} />}</>}</td></tr> : answer.question?.is_header ? <><tr key={`section-${answer.id}`} className="border-t bg-slate-100"><td colSpan={columns.length + 2} className="px-3 py-3 font-bold text-slate-800">{answer.question.pertanyaan}</td></tr><tr key={`section-columns-${answer.id}`} className="bg-gray-50 text-xs font-semibold text-slate-700"><th className="w-14 p-3">No</th><th className="w-[24rem] min-w-[220px] max-w-[40vw] p-3">{answer.question.question_title_override || ''}</th>{columns.map((column, index) => <th key={column.key} className="w-[12rem] min-w-[9rem] max-w-[15rem] whitespace-normal break-words p-3">{answer.question.column_titles?.[index] || ''}</th>)}</tr></> : <tr key={answer.id} className="border-t">
      <td className="w-14 p-3 align-top">{no}</td><td className="w-[24rem] min-w-[220px] max-w-[40vw] p-3 align-top break-words">{answer.source_stage && <span className={`mb-1.5 block w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${answer.source_stage === 1 ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-700'}`}>{satkerMode ? (answer.source_stage === 1 ? 'Dari Tahap 1' : 'Tambahan Tahap 2') : (answer.source_stage === 1 ? `Dari ${getReviewerStageName(1)}` : `Tambahan ${getReviewerStageName(2)}`)}</span>}{satkerMode && !disabled && (answer.question?.satker_lock_mode ?? 'NONE') === 'NONE' ? <input aria-label="Rincian" placeholder="Isi rincian…" value={(values[answer.id] ?? answer).custom_values?.__rincian ?? answer.question?.pertanyaan ?? ''} onChange={(event) => { const row = values[answer.id] ?? answer; onChange(String(answer.id), { ...row, custom_values: { ...row.custom_values, __rincian: event.target.value } }) }} className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 focus:ring-2 focus:ring-blue-100" /> : ((values[answer.id] ?? answer).custom_values?.__rincian ?? answer.question?.pertanyaan ?? '')}</td>
      {columns.map((column) => {
        const rowDisabled = disabled || (satkerMode && answer.question?.satker_lock_mode === 'ROW')
        const row = values[answer.id] ?? answer
        const customValues = row.custom_values ?? {}
        const hasCustomValue = Object.prototype.hasOwnProperty.call(customValues, column.key)
        const legacyValue = column.key === 'jawaban_boolean' ? row.jawaban_boolean
          : column.key === 'catatan_string' ? row.catatan_string
            : column.key === 'link' ? row.link
              : row[column.key]
        const value = column.type === 'readonly' ? column.defaultValue : hasCustomValue ? customValues[column.key] : legacyValue
        const missingRequired = showRequiredErrors && column.required && !rowDisabled && column.type !== 'readonly' && (
          column.type === 'checkbox' ? value !== true
            : value === undefined || value === null || (typeof value === 'string' && !value.trim())
        )
        const update = (next: string | boolean | number) => onChange(String(answer.id), { ...row, custom_values: { ...row.custom_values, [column.key]: next } })
        const clickableUrl = getClickableUrl(value)
        let input
        if (rowDisabled && column.type === 'url') input = clickableUrl
          ? <a href={clickableUrl} target="_blank" rel="noreferrer" className="block max-w-full break-all text-blue-700 underline decoration-blue-300 underline-offset-2 hover:text-blue-900">{String(value)}</a>
          : <span className="break-all text-slate-400">{value || '—'}</span>
        else if (rowDisabled && column.type === 'checkbox') input = <div className="flex justify-center"><input aria-label={column.title} type="checkbox" checked={value === true} disabled className="h-4 w-4 cursor-not-allowed rounded border-slate-300 accent-slate-500 disabled:opacity-60" /></div>
        else if (rowDisabled) input = <span className={`block max-w-[min(32rem,70vw)] whitespace-pre-wrap break-words [overflow-wrap:anywhere] ${value === '' || value == null ? 'text-slate-400' : 'text-slate-700'}`}>{value === '' || value == null ? '—' : String(value)}</span>
        else if (column.type === 'readonly') input = <span className="text-gray-500">{value || '—'}</span>
        else if (column.type === 'url') input = <input aria-label={column.title} type="url" value={value ?? ''} onChange={(event) => update(event.target.value)} className="w-full rounded border p-2" />
        else if (column.type === 'checkbox') input = <div className="flex justify-center"><input aria-label={column.title} disabled={rowDisabled} type="checkbox" checked={value === true} onChange={(event) => update(event.target.checked)} /></div>
        else if (column.type === 'textarea') input = <textarea aria-label={column.title} disabled={rowDisabled} value={value ?? ''} rows={2} onChange={(event) => update(event.target.value)} className="w-full rounded border p-2 disabled:bg-gray-50" />
        else if (column.type === 'select') input = <select aria-label={column.title} disabled={rowDisabled} value={value ?? ''} onChange={(event) => update(event.target.value)} className="w-full rounded border p-2 disabled:bg-gray-50"><option value="">Pilih opsi</option>{(column.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
        else if (column.type === 'radio') input = <div className="space-y-1">{(column.options ?? []).map((option) => <label key={option} className="flex items-center gap-2"><input disabled={rowDisabled} type="radio" name={`${answer.id}-${column.key}`} checked={value === option} onChange={() => update(option)} />{option}</label>)}</div>
        else if (column.type === 'score') input = <select aria-label={column.title} disabled={rowDisabled} value={value ?? ''} onChange={(event) => update(Number(event.target.value))} className="w-full rounded border p-2 disabled:bg-gray-50"><option value="">Pilih skor</option>{[1, 2, 3, 4, 5].map((score) => <option key={score} value={score}>{'★'.repeat(score)} ({score})</option>)}</select>
        else input = <input aria-label={column.title} disabled={rowDisabled} type={column.type} value={value ?? ''} onChange={(event) => update(column.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value)} className="w-full rounded border p-2 disabled:bg-gray-50" />
        return <td key={column.key} className={`w-[12rem] min-w-[9rem] max-w-[15rem] p-3 align-top ${column.type === 'checkbox' ? 'w-40 min-w-[8rem] max-w-[10rem] align-middle' : ''}`}><div className={`rounded-lg ${missingRequired ? 'rounded-lg border border-red-300 bg-red-50/60 p-2 ring-1 ring-red-100' : ''}`}>{input}{missingRequired && <p className="mt-1.5 text-xs font-medium text-red-600">Wajib diisi</p>}</div></td>
      })}
    </tr>)}</tbody>
    </table>
    </div>
  </div>
}
