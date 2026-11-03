import { CONCLUSION_MARKER, conclusionText } from '../../utils/ba-conclusion'
import { addFinalSignatures } from '../../utils/ba-excel-signatures'
import { addBAExcelHeader, BA_TABLE_START_ROW } from '../../utils/ba-excel-header'
import { buildBAExcelRows } from '../../utils/ba-excel-rows'
import type { BAReportHeader } from '../../services/inovasi.service'
import { getBAColumns } from '../../services/inovasi.service'
import type { BAColumn } from '../../services/inovasi.service'
import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { getUsulanSelesai, getUsulanDetail, downloadHasilEvaluasiPdf } from '../../services/inovasi.service'
import { getSatker } from '../../services/satker.service'
import { getStatusPresentation } from '../../utils/inovasi-status'
import { getReviewerStageName } from '../../utils/tahap-reviewer'
import TablePagination from '../../components/TablePagination'
import TableToolbar, { type TableSortOrder } from '../../components/TableToolbar'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { useNotifications } from '../../components/NotificationProvider'

interface UsulanItem {
  id: string
  tanggal_masuk?: string
  createdAt?: string
  created_at?: string
  nama_satker?: string
  satker?: { nama_satker: string }
  user?: { satker?: { nama_satker: string } }
  nama_inovasi?: string
  judul?: string
  penanggung_jawab?: string
  pic_nama?: string
  hasil_penilaian?: string | null
  hasil_penilaian_tahap1?: string | null
  hasil_penilaian_tahap2?: string | null
  penilai?: { id: string | number }[]
  penilai_tahap2?: { id: string | number }[]
  usulan_signatures?: { user_id: string | number; tahap?: number; keputusan?: string | null }[]
  status: string
  assessment_answers?: any[]
  tanda_tangan?: any[]
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number
}

interface SatkerOption { id: string | number; nama_satker: string }

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return dateStr }
}

function sanitizeFileName(name: string) {
  return name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Inovasi'
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function getErrorMessage(err: unknown): Promise<string> {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data
    if (data instanceof Blob) {
      try {
        const text = await data.text()
        const parsed = JSON.parse(text)
        return parsed?.message || parsed?.error || err.message
      } catch {
        return err.message
      }
    }
    return (data as { message?: string })?.message || err.message
  }
  return err instanceof Error ? err.message : 'Terjadi kesalahan'
}

export async function exportToExcel(data: any, tahap: number, columns: BAColumn[], _questionTitle = 'Kriteria Penilaian', reportHeader?: BAReportHeader) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Berita Acara')
  worksheet.columns = [{ width: 8 }, { width: 55 }, ...columns.map((c) => ({ width: c.type === 'checkbox' ? 16 : 32 }))]
  const count = columns.length + 2
  await addBAExcelHeader(workbook, worksheet, count, data, reportHeader)
  const answers = data.assessment_answers ?? []
  const rows = buildBAExcelRows(answers)
  let rowOffset = 0
  const emphasizedRows = new Set<number>()
  const conclusionRows = new Set<number>()
  rows.forEach(({ answer, no, child }: any, index: number) => {
    const rowNumber = index + BA_TABLE_START_ROW + rowOffset
    if (answer.question?.question_title_override === CONCLUSION_MARKER) {
      worksheet.mergeCells(rowNumber, 1, rowNumber, count);
      worksheet.getCell(rowNumber, 1).value = answer.question.pertanyaan + '\n' + conclusionText(answer);
      conclusionRows.add(rowNumber);
      emphasizedRows.add(rowNumber);
      return;
    }
    if (answer.question?.is_header) {
      worksheet.mergeCells(rowNumber, 1, rowNumber, count);
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
    worksheet.getRow(rowNumber).values = [no, (child ? '    ' : '') + (answer.custom_values?.__rincian ?? answer.question?.pertanyaan ?? ''), ...columns.map((c) => {
      const value = c.type === 'readonly' ? c.defaultValue : answer.custom_values?.[c.key] ?? answer[c.key]
      return c.type === 'checkbox' ? (value ? 'V' : '') : value ?? ''
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
  const signatures = data.signatures ?? data.usulan_signatures ?? []
  if (tahap === 2) addFinalSignatures(workbook, worksheet, count, BA_TABLE_START_ROW + 2 + rows.length + rowOffset, signatures, reportHeader?.dateText)
  else {
    signatures.forEach((sig: any, index: number) => {
      const column = index % 2 === 0 ? 2 : Math.max(4, count)
      const row = BA_TABLE_START_ROW + 2 + rows.length + rowOffset + Math.floor(index / 2) * 9
      for (const [offset, value] of [[0, sig.jabatan || sig.role || '-'], [4, sig.nama || sig.user?.nama_lengkap || '-'], [5, `NIP ${sig.nip || '-'}`]] as const) {
        const cell = worksheet.getCell(row + offset, column)
        cell.value = value; cell.font = { name: 'Times New Roman', size: 11, bold: offset === 0 }
        cell.alignment = { horizontal: 'center', wrapText: true }
      }
      worksheet.getRow(row).height = 35
      if (sig.ttd_image) {
        const match = /^data:image\/(png|jpe?g|gif);base64,/i.exec(sig.ttd_image)
        if (match) {
          const extension = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()
          const image = workbook.addImage({ base64: sig.ttd_image, extension: extension as 'png' | 'jpeg' | 'gif' })
          worksheet.addImage(image, { tl: { col: column - 1 + 0.1, row }, ext: { width: 140, height: 55 } })
        }
      }
    })
  }
  worksheet.views = [{ state: 'frozen', ySplit: BA_TABLE_START_ROW - 1, xSplit: 2 }]
  const buffer = await workbook.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `BA_Inovasi${tahap === 2 ? '_Tahap_2' : ''}_${sanitizeFileName(data.judul || 'Inovasi')}.xlsx`)
}

export default function Tahap1Hasil({ tahap = 1 }: { tahap?: number }) {
  const { notify } = useNotifications()
  const [data, setData] = useState<UsulanItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [satkerFilter, setSatkerFilter] = useState('')
  const [satkerOptions, setSatkerOptions] = useState<SatkerOption[]>([])
  const [page, setPage] = useState(1)
  const [sortOrder, setSortOrder] = useState<TableSortOrder>('desc')
  const [exportingId, setExportingId] = useState<string | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsulanSelesai({
        page, limit,
        search: search || undefined,
        hasil: statusFilter || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        satker_id: satkerFilter || undefined,
        tahap,
        sort_order: sortOrder,
      })
      const body = res.data
      setData(Array.isArray(body) ? body : body.data ?? [])
      setMeta(body.meta
        ? { ...body.meta, totalPages: body.meta.total_pages ?? body.meta.totalPages }
        : body.pagination ?? { page, limit, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat data' : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [page, limit, search, statusFilter, startDate, endDate, satkerFilter, tahap, sortOrder])

  useEffect(() => { fetchList() }, [fetchList])

  useEffect(() => {
    getSatker()
      .then((response) => setSatkerOptions(Array.isArray(response.data) ? response.data : response.data?.data ?? []))
      .catch(() => setSatkerOptions([]))
  }, [])

  const handleExportPdf = async (item: UsulanItem) => {
    setExportingId(item.id)
    try {
      const res = await downloadHasilEvaluasiPdf(item.id, tahap)
      const blob: Blob = res.data
      if (blob.type !== 'application/pdf') {
        throw new Error('Respons dari server bukan file PDF')
      }
      const judul = item.judul || item.nama_inovasi || 'Inovasi'
      const tahapSuffix = tahap === 2 ? '_Tahap_2' : ''
      downloadBlob(blob, `BA_Inovasi${tahapSuffix}_${sanitizeFileName(judul)}.pdf`)
    } catch (err: unknown) {
      const message = await getErrorMessage(err)
      notify(message || 'Gagal mengunduh file PDF. Silakan coba lagi.', 'error')
    } finally {
      setExportingId(null)
    }
  }

  const handleExportExcel = async (item: UsulanItem) => {
    setExportingId(item.id)
    try {
      const res = await getUsulanDetail(item.id, tahap)
      const detailData = res.data?.data || res.data
      const columns = await getBAColumns(tahap)
      await exportToExcel(detailData, tahap, columns.data.columns, columns.data.questionTitle, columns.data.reportHeader)
    } catch {
      notify('Gagal memuat detail usulan untuk export Excel.', 'error')
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Hasil Evaluasi {getReviewerStageName(tahap)}</h2>
          <p className="text-sm text-gray-500">{getReviewerStageName(tahap)} — Usulan dengan status Selesai Evaluasi</p>
        </div>
        <button onClick={fetchList} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh Data
        </button>
      </div>

      <TableToolbar search={search} onSearchChange={(value) => { setSearch(value); setPage(1) }} searchPlaceholder="Cari inovasi / PIC..." sortOrder={sortOrder} onSortOrderChange={(value) => { setSortOrder(value); setPage(1) }}>
        <label className="block text-xs font-medium text-slate-500">Status
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
            <option value="">Semua Status</option>
            <option value="SEDANG_DIREVIEW">Sedang Direview</option>
            <option value="MENUNGGU_TTD">Menunggu Tanda Tangan</option>
            <option value="LOLOS">Lolos</option>
            <option value="TIDAK_LOLOS">Tidak Lolos</option>
            <option value="PERBAIKAN">Perlu Perbaikan</option>
          </select>
        </label>
        <label className="block text-xs font-medium text-slate-500">Dari tanggal
          <input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="block text-xs font-medium text-slate-500">Sampai tanggal
          <input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100" />
        </label>
        <label className="block text-xs font-medium text-slate-500">Unit
          <select value={satkerFilter} onChange={(event) => { setSatkerFilter(event.target.value); setPage(1) }} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100">
            <option value="">Semua Unit</option>
            {satkerOptions.map((satker) => <option key={satker.id} value={satker.id}>{satker.nama_satker}</option>)}
          </select>
        </label>
      </TableToolbar>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="border-b px-4 py-4 sm:px-6">Tanggal Masuk</th>
                <th className="border-b px-4 py-4 sm:px-6">Unit</th>
                <th className="border-b px-4 py-4 sm:px-6">Judul Inovasi</th>
                <th className="border-b px-4 py-4 sm:px-6">PIC</th>
                <th className="border-b px-4 py-4 sm:px-6">Status</th>
                <th className="border-b px-4 py-4 text-right sm:px-6">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">
                    <svg className="h-5 w-5 animate-spin text-blue-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                    </svg>
                    Memuat data usulan...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">Belum ada hasil evaluasi Tahap {tahap}</td></tr>
              ) : (
                data.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-blue-50/50">
                    <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{formatDate(item.createdAt || item.created_at || item.tanggal_masuk)}</td>
                    <td className="px-4 py-3.5 text-gray-600 sm:px-6 font-medium text-blue-900">{item.nama_satker || item.satker?.nama_satker || item.user?.satker?.nama_satker || '-'}</td>
                    <td className="px-4 py-3.5 text-gray-800 font-medium sm:px-6">{item.judul || item.nama_inovasi}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{item.pic_nama || item.penanggung_jawab || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 sm:px-6">
                      {(() => { const status = getStatusPresentation(item, tahap); return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${status.className}`}>{status.label}</span> })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleExportPdf(item)}
                          disabled={exportingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {exportingId === item.id ? (
                            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                          )}
                          {exportingId === item.id ? 'Memproses...' : 'PDF'}
                        </button>
                        <button
                          onClick={() => handleExportExcel(item)}
                          disabled={exportingId === item.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {exportingId === item.id ? (
                            <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" /></svg>
                          )}
                          {exportingId === item.id ? 'Memproses...' : 'Excel'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <TablePagination meta={meta} onPage={setPage} onLimitChange={(size) => { setLimit(size); setPage(1) }} />
      </div>
    </div>
  )
}
