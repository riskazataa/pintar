import { CONCLUSION_MARKER, conclusionText } from '../../utils/ba-conclusion'
import { addFinalSignatures } from '../../utils/ba-excel-signatures'
import FinalSignatureForm from '../../components/FinalSignatureForm'
import { addBAExcelHeader, BA_TABLE_START_ROW } from '../../utils/ba-excel-header'
import { buildBAExcelRows } from '../../utils/ba-excel-rows'
import type { BAReportHeader } from '../../services/inovasi.service'
import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import {
  downloadHasilEvaluasiPdf,
  getBAColumns,
  getUsulanDetail,
  getUsulanSelesai,
} from '../../services/inovasi.service'
import type { BAColumn } from '../../services/inovasi.service'
import TablePagination from '../../components/TablePagination'
import TableToolbar, { type TableSortOrder } from '../../components/TableToolbar'

interface HasilUsulan {
  id: string | number
  judul?: string
  created_at?: string
  createdAt?: string
  hasil_penilaian_tahap1?: string | null
  hasil_penilaian_tahap2?: string | null
  usulan_signatures?: { user_id: number | string; tahap: number }[]
}

interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

function ResultBadge({ value }: { value?: string | null }) {
  const styles = value === 'LOLOS'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : value === 'TIDAK_LOLOS'
      ? 'border-rose-200 bg-rose-50 text-rose-700'
      : 'border-amber-200 bg-amber-50 text-amber-700'
  const label = value === 'LOLOS' ? 'Lolos' : value === 'TIDAK_LOLOS' ? 'Tidak Lolos' : 'Belum dinilai'
  return <span className={'inline-flex rounded-full border px-3 py-1 text-xs font-semibold ' + styles}>{label}</span>
}

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Inovasi'
}

function downloadPdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function exportToExcel(data: any, tahap: number, columns: BAColumn[], _questionTitle = 'Kriteria Penilaian', reportHeader?: BAReportHeader) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Berita Acara')
  worksheet.columns = [{ width: 8 }, { width: 55 }, ...columns.map((column) => ({ width: column.type === 'checkbox' ? 16 : 32 }))]
  const columnCount = columns.length + 2
  await addBAExcelHeader(workbook, worksheet, columnCount, data, reportHeader)
  const answers = data.assessment_answers ?? []
  const rows = buildBAExcelRows(answers)

  let rowOffset = 0
  const emphasizedRows = new Set<number>()
  const conclusionRows = new Set<number>()
  rows.forEach(({ answer, no, child }: any, index: number) => {
    const rowNumber = index + BA_TABLE_START_ROW + rowOffset
    if (answer.question?.question_title_override === CONCLUSION_MARKER) {
      worksheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
      worksheet.getCell(rowNumber, 1).value = answer.question.pertanyaan + '\n' + conclusionText(answer);
      conclusionRows.add(rowNumber);
      emphasizedRows.add(rowNumber);
      return;
    }
    if (answer.question?.is_header) {
      worksheet.mergeCells(rowNumber, 1, rowNumber, columnCount);
      const cell = worksheet.getCell(rowNumber, 1);
      cell.value = answer.question.pertanyaan;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      emphasizedRows.add(rowNumber);
      const titleRow = worksheet.getRow(rowNumber + 1);
      titleRow.values = ['No', answer.question.question_title_override || '', ...columns.map((_column: any, columnIndex: number) => answer.question.column_titles?.[columnIndex] || '')];
      titleRow.eachCell({ includeEmpty: true }, (titleCell) => { titleCell.font = { name: 'Times New Roman', size: 10, bold: true }; titleCell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; titleCell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } } });
      emphasizedRows.add(rowNumber + 1); rowOffset += 1;
      return;
    }
    worksheet.getRow(rowNumber).values = [no, (child ? '    ' : '') + (answer.custom_values?.__rincian ?? answer.question?.pertanyaan ?? ''), ...columns.map((column) => {
      const value = column.type === 'readonly' ? column.defaultValue : answer.custom_values?.[column.key] ?? answer[column.key]
      return column.type === 'checkbox' ? (value ? 'V' : '') : value ?? ''
    })]
  })

  for (let row = BA_TABLE_START_ROW; row < BA_TABLE_START_ROW + rows.length + rowOffset; row++) {
    worksheet.getRow(row).eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Times New Roman', size: 10, bold: emphasizedRows.has(row) }
      cell.alignment = { wrapText: true, vertical: 'middle' }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    })
    worksheet.getRow(row).height = conclusionRows.has(row) ? 32 + Math.ceil(String(worksheet.getCell(row, 1).value ?? '').length / 90) * 16 : 36
  }

  // Sertakan blok tanda tangan dan gambar tanda tangan pada file Excel.
  const signatures = data.signatures ?? data.usulan_signatures ?? []
  if (tahap === 2) addFinalSignatures(workbook, worksheet, columnCount, BA_TABLE_START_ROW + 2 + rows.length + rowOffset, signatures, reportHeader?.dateText)
  else {
    signatures.forEach((signature: any, index: number) => {
      const column = index % 2 === 0 ? 2 : Math.max(4, columnCount)
      const row = BA_TABLE_START_ROW + 2 + rows.length + rowOffset + Math.floor(index / 2) * 9
      for (const [offset, value] of [
        [0, signature.jabatan || signature.role || '-'],
        [4, signature.nama || signature.user?.nama_lengkap || '-'],
        [5, `NIP ${signature.nip || '-'}`],
      ] as const) {
        const cell = worksheet.getCell(row + offset, column)
        cell.value = value
        cell.font = { name: 'Times New Roman', size: 11, bold: offset === 0 }
        cell.alignment = { horizontal: 'center', wrapText: true }
      }
      worksheet.getRow(row).height = 35
      if (signature.ttd_image) {
        const match = /^data:image\/(png|jpe?g|gif);base64,/i.exec(signature.ttd_image)
        if (match) {
          const extension = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()
          const image = workbook.addImage({ base64: signature.ttd_image, extension: extension as 'png' | 'jpeg' | 'gif' })
          worksheet.addImage(image, { tl: { col: column - 1 + 0.1, row }, ext: { width: 140, height: 55 } })
        }
      }
    })

  }
  worksheet.views = [{ state: 'frozen', ySplit: BA_TABLE_START_ROW - 1, xSplit: 2 }]
  const buffer = await workbook.xlsx.writeBuffer()
  const suffix = tahap === 2 ? '_Tahap_2' : ''
  saveAs(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `BA_Inovasi${suffix}_${sanitizeFileName(data.judul || 'Inovasi')}.xlsx`,
  )
}

export default function Hasil() {
  const [currentUserId] = useState(() => {
    try { return String(JSON.parse(localStorage.getItem('user') || '{}').id ?? '') }
    catch { return '' }
  })
  const [data, setData] = useState<HasilUsulan[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [sortOrder, setSortOrder] = useState<TableSortOrder>('desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signDetail, setSignDetail] = useState<any>(null)
  const [exportingId, setExportingId] = useState<string | number | null>(null)

  const fetchResults = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await getUsulanSelesai({
        page,
        limit,
        search: search.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sort_order: sortOrder,
      })
      const body = response.data
      setData(Array.isArray(body) ? body : body.data ?? [])
      setMeta(body.meta
        ? { page: body.meta.page, limit: body.meta.limit, total: body.meta.total, totalPages: body.meta.total_pages ?? body.meta.totalPages }
        : { page, limit, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat hasil penilaian.' : 'Gagal memuat hasil penilaian.')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, startDate, endDate, sortOrder])

  useEffect(() => { fetchResults() }, [fetchResults])

  const handleExportPdf = async (item: HasilUsulan, tahap: 1 | 2) => {
    setExportingId(item.id)
    try {
      const response = await downloadHasilEvaluasiPdf(item.id, tahap)
      const blob: Blob = response.data
      if (blob.type !== 'application/pdf') throw new Error('Respons dari server bukan file PDF.')
      const suffix = tahap === 2 ? '_Tahap_2' : '_Tahap_1'
      downloadPdf(blob, `BA_Inovasi${suffix}_${sanitizeFileName(item.judul || 'Inovasi')}.pdf`)
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal mengunduh PDF.' : err instanceof Error ? err.message : 'Gagal mengunduh PDF.')
    } finally {
      setExportingId(null)
    }
  }

  const handleExportExcel = async (item: HasilUsulan, tahap: 1 | 2) => {
    setExportingId(item.id)
    try {
      const [detailResponse, columnsResponse] = await Promise.all([
        getUsulanDetail(item.id, tahap, 'evaluation'),
        getBAColumns(tahap),
      ])
      const detail = detailResponse.data?.data || detailResponse.data
      await exportToExcel(detail, tahap, columnsResponse.data.columns, columnsResponse.data.questionTitle, columnsResponse.data.reportHeader)
    } catch {
      setError('Gagal memuat detail, template, atau tanda tangan untuk export Excel.')
    } finally {
      setExportingId(null)
    }
  }

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-800">Hasil Penilaian Inovasi</h2>
        <p className="text-sm text-gray-500">Hasil Seleksi Awal dan Penilaian Akhir ditampilkan bersama untuk setiap inovasi.</p>
      </div>
      <button onClick={fetchResults} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
        <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        Refresh
      </button>
    </div>

    <TableToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1) }} searchPlaceholder="Cari judul inovasi..." sortOrder={sortOrder} onSortOrderChange={(value) => { setSortOrder(value); setPage(1) }} onClearFilters={() => { setSearch(''); setStartDate(''); setEndDate(''); setSortOrder('desc'); setPage(1) }}>
      <label className="block text-xs font-medium text-slate-500">Dari tanggal
        <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
      </label>
      <label className="block text-xs font-medium text-slate-500">Sampai tanggal
        <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
      </label>
    </TableToolbar>

    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-slate-200 px-4 py-3.5">Tanggal masuk</th>
              <th className="border-b border-slate-200 px-4 py-3.5">Judul inovasi</th>
              <th className="border-b border-slate-200 px-4 py-3.5">Hasil Seleksi Awal</th>
              <th className="border-b border-slate-200 px-4 py-3.5">Hasil Penilaian Akhir</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading
              ? <tr><td colSpan={4} className="px-5 py-14 text-center text-sm text-slate-400">Memuat hasil penilaian...</td></tr>
              : data.length === 0
                ? <tr><td colSpan={4} className="px-5 py-14 text-center text-sm text-slate-400">Belum ada hasil penilaian.</td></tr>
                : data.map((item) => <tr key={item.id} className="transition-colors hover:bg-violet-50/30">
                  <td className="whitespace-nowrap border-b border-slate-100 px-4 py-4 text-slate-500">{formatDate(item.created_at || item.createdAt)}</td>
                  <td className="border-b border-slate-100 px-4 py-4 font-semibold text-slate-800">{item.judul || '—'}</td>
                  {([1, 2] as const).map((stage) => {
                    const result = stage === 1 ? item.hasil_penilaian_tahap1 : item.hasil_penilaian_tahap2
                    const isComplete = result === 'LOLOS' || result === 'TIDAK_LOLOS'
                    return <td key={stage} className="min-w-[250px] border-b border-slate-100 px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <ResultBadge value={result} />
                        {stage === 2 && !item.usulan_signatures?.some((signature) => signature.tahap === 2 && String(signature.user_id) === currentUserId) && <button type="button" className="rounded-lg border border-teal-200 px-3 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-50" onClick={async () => { try { const response = await getUsulanDetail(item.id, 2, 'evaluation'); setSignDetail(response.data?.data ?? response.data) } catch { setError('Penilaian akhir belum tersedia.') } }}>Tanda tangan BA</button>}
                        {isComplete && <details className="group relative">
                          <summary aria-label={`Ekspor hasil Tahap ${stage}`} title={`Ekspor hasil Tahap ${stage}`} className="inline-flex h-8 w-9 cursor-pointer list-none items-center justify-center gap-0.5 rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 [&::-webkit-details-marker]:hidden">
                            <svg aria-hidden="true" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 12 4-4m-4 4-4-4M4 17v3h16v-3" /></svg>
                            <svg aria-hidden="true" className="h-3 w-3 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg>
                          </summary>
                          <div role="menu" aria-label={`Format ekspor Tahap ${stage}`} className="absolute left-0 top-full z-30 mt-1 flex w-fit min-w-32 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                            <button role="menuitem" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void handleExportPdf(item, stage) }} disabled={exportingId === item.id} className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
                              <svg aria-hidden="true" className="h-3.5 w-3.5 text-rose-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M7 3.75h7l4 4v12.5A1.75 1.75 0 0 1 16.25 22h-8.5A1.75 1.75 0 0 1 6 20.25V5.5A1.75 1.75 0 0 1 7.75 3.75ZM14 4v4h4m-9 5h6m-6 3h4" /></svg>
                              PDF
                            </button>
                            <button role="menuitem" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void handleExportExcel(item, stage) }} disabled={exportingId === item.id} className="flex h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                              <svg aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="2" /><path strokeLinecap="round" d="M3.5 9h17M3.5 15h17M9 9v11m6-11v11" /></svg>
                              Excel
                            </button>
                          </div>
                        </details>}
                      </div>
                    </td>
                  })}
                </tr>)}
          </tbody>
        </table>
      </div>
      {!loading && <TablePagination meta={meta} onPage={setPage} onLimitChange={(size) => { setLimit(size); setPage(1) }} />}
    </div>
    {signDetail && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-4"><section role="dialog" aria-modal="true" aria-label="Tanda tangan BA penilaian akhir" className="my-auto w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"><div className="mb-5 flex items-start justify-between gap-4"><h2 className="font-semibold">{signDetail.judul}</h2><button type="button" aria-label="Tutup" onClick={() => setSignDetail(null)}>✕</button></div>{signDetail.signatures?.some((sig: any) => String(sig.user_id) === String(JSON.parse(localStorage.getItem('user') || '{}').id)) ? <p className="text-sm text-teal-700">Anda sudah menandatangani BA penilaian akhir ini.</p> : <FinalSignatureForm id={signDetail.id} satker={signDetail.satker} unitMode disabled={signDetail.requires_assessment_save} onSigned={async () => { setSignDetail(null); await fetchResults() }} />}</section></div>}
  </div>
}
