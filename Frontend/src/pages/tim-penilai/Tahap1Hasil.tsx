import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import { getUsulanSelesai, getUsulanDetail } from '../../services/inovasi.service'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

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
  status: string
  assessment_answers?: any[]
  tanda_tangan?: any[]
}

interface PaginationMeta {
  page: number; limit: number; total: number; totalPages: number
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return dateStr }
}

function Paginator({ meta, onPage }: { meta: PaginationMeta; onPage: (p: number) => void }) {
  if (meta.totalPages <= 1) return null
  const pages: (number | string)[] = []
  for (let i = 1; i <= meta.totalPages; i++) {
    if (i === 1 || i === meta.totalPages || (i >= meta.page - 1 && i <= meta.page + 1)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }
  return (
    <div className="flex items-center justify-between border-t px-4 py-3 sm:px-6">
      <p className="text-sm text-gray-500">
        Menampilkan {((meta.page - 1) * meta.limit) + 1}–{Math.min(meta.page * meta.limit, meta.total)} dari {meta.total}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(meta.page - 1)} disabled={meta.page <= 1} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">Prev</button>
        {pages.map((p, i) => typeof p === 'string'
          ? <span key={`ellipsis-${i}`} className="px-2 text-sm text-gray-400">...</span>
          : <button key={p} onClick={() => onPage(p)} className={`min-w-[32px] rounded-lg px-2 py-1.5 text-sm font-medium transition ${p === meta.page ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}>{p}</button>
        )}
        <button onClick={() => onPage(meta.page + 1)} disabled={meta.page >= meta.totalPages} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed">Next</button>
      </div>
    </div>
  )
}

function exportToExcel(data: any) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Berita Acara')

  worksheet.columns = [
    { header: '', key: 'no', width: 6 },
    { header: '', key: 'kriteria', width: 55 },
    { header: '', key: 'ya', width: 15 },
    { header: '', key: 'catatan', width: 45 },
  ]

  const borderStyle: Partial<ExcelJS.Border> = { style: 'thin' }
  const allBorders = { top: borderStyle, left: borderStyle, bottom: borderStyle, right: borderStyle }

  // Row 1: Title
  worksheet.mergeCells('A1:D1')
  const titleCell = worksheet.getCell('A1')
  titleCell.value = 'Form Seleksi Awal Penilaian Inovasi'
  titleCell.font = { bold: true, size: 14, name: 'Times New Roman' }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getRow(1).height = 30

  // Row 3: Nama Satker
  const satker = data.nama_satker || data.satker?.nama_satker || data.user?.satker?.nama_satker || '-'
  worksheet.getCell('A3').value = `Satker: ${satker}`
  worksheet.getCell('A3').font = { size: 11, name: 'Times New Roman' }

  // Row 4: Nama Inovasi
  const judul = data.judul || data.nama_inovasi || '-'
  worksheet.getCell('A4').value = `Inovasi: ${judul}`
  worksheet.getCell('A4').font = { size: 11, name: 'Times New Roman' }

  // Row 6: Table Header
  const headerRow = worksheet.getRow(6)
  const headerValues = ['No', 'Kriteria Penilaian Seleksi Awal', 'Ya/Tidak (V)', 'Catatan']
  headerValues.forEach((val, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = val
    cell.font = { bold: true, size: 10, name: 'Times New Roman' }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: i === 1 }
    cell.border = allBorders
  })
  headerRow.height = 25

  // Data rows with hierarchical numbering (mulai baris 7)
  const answers = data.assessment_answers || []
  const parents = answers.filter((a: any) => !a.question?.parent_id)
  let totalDataRows = 0

  parents.forEach((parent: any, pIdx: number) => {
    const children = answers.filter((a: any) => a.question?.parent_id === parent.question?.id)

    // --- Parent row (bold) ---
    const parentRowNum = 7 + totalDataRows
    const parentRow = worksheet.getRow(parentRowNum)

    parentRow.getCell(1).value = pIdx + 1
    parentRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
    parentRow.getCell(1).font = { bold: true, size: 10, name: 'Times New Roman' }
    parentRow.getCell(1).border = allBorders

    parentRow.getCell(2).value = parent.question?.pertanyaan || '-'
    parentRow.getCell(2).alignment = { wrapText: true, vertical: 'middle' }
    parentRow.getCell(2).font = { bold: true, size: 10, name: 'Times New Roman' }
    parentRow.getCell(2).border = allBorders

    parentRow.getCell(3).value = parent.jawaban_boolean ? 'V' : ''
    parentRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }
    parentRow.getCell(3).font = { bold: true, size: 10, name: 'Times New Roman' }
    parentRow.getCell(3).border = allBorders

    parentRow.getCell(4).value = parent.catatan_string || ''
    parentRow.getCell(4).alignment = { vertical: 'middle', wrapText: true }
    parentRow.getCell(4).font = { size: 10, name: 'Times New Roman' }
    parentRow.getCell(4).border = allBorders

    totalDataRows++

    // --- Child rows (indented) ---
    children.forEach((child: any, cIdx: number) => {
      const childRowNum = 7 + totalDataRows
      const childRow = worksheet.getRow(childRowNum)

      childRow.getCell(1).value = `${pIdx + 1}.${String.fromCharCode(97 + cIdx)}`
      childRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      childRow.getCell(1).font = { size: 9, name: 'Times New Roman' }
      childRow.getCell(1).border = allBorders

      childRow.getCell(2).value = `    ${String.fromCharCode(97 + cIdx)}. ${child.question?.pertanyaan || '-'}`
      childRow.getCell(2).alignment = { wrapText: true, vertical: 'middle' }
      childRow.getCell(2).font = { size: 10, name: 'Times New Roman' }
      childRow.getCell(2).border = allBorders

      childRow.getCell(3).value = child.jawaban_boolean ? 'V' : ''
      childRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }
      childRow.getCell(3).font = { size: 10, name: 'Times New Roman' }
      childRow.getCell(3).border = allBorders

      childRow.getCell(4).value = child.catatan_string || ''
      childRow.getCell(4).alignment = { vertical: 'middle', wrapText: true }
      childRow.getCell(4).font = { size: 10, name: 'Times New Roman' }
      childRow.getCell(4).border = allBorders

      totalDataRows++
    })
  })

  // API detail dan PDF menggunakan daftar signatures yang sama.
  const signatures = data.signatures ?? data.usulan_signatures ?? []
  const signStartRow = 9 + totalDataRows
  signatures.forEach((signature: any, index: number) => {
    const column = index % 2 === 0 ? 2 : 4
    const titleRow = signStartRow + Math.floor(index / 2) * 9
    const setText = (row: number, value: string, bold = false) => {
      const cell = worksheet.getRow(row).getCell(column)
      cell.value = value
      cell.font = { name: 'Times New Roman', size: 11, bold }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    }
    setText(titleRow, signature.role || '-', true)
    worksheet.getRow(titleRow).height = 30
    for (let row = titleRow + 1; row <= titleRow + 3; row++) {
      worksheet.getRow(row).height = 22
    }
    if (signature.ttd_image) {
      const match = /^data:image\/(png|jpe?g|gif);base64,/i.exec(signature.ttd_image)
      if (!match) throw new Error('Format gambar tanda tangan tidak didukung')
      const extension = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()
      const imageId = workbook.addImage({ base64: signature.ttd_image, extension: extension as 'png' | 'jpeg' | 'gif' })
      worksheet.addImage(imageId, {
        tl: { col: column === 2 ? 1.3 : 3.25, row: titleRow + 0.1 },
        ext: { width: 140, height: 55 },
        editAs: 'oneCell',
      })
    }
    setText(titleRow + 4, signature.nama || '-')
    setText(titleRow + 5, 'NIP. ' + (signature.nip || '-'))
  })

  // Finalisasi & Download
  return workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    saveAs(blob, `BA_Inovasi_${judul}.xlsx`)
  })
}

export default function Tahap1Hasil() {
  const [data, setData] = useState<UsulanItem[]>([])
  const [meta, setMeta] = useState<PaginationMeta>({ page: 1, limit: 10, total: 0, totalPages: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [exportingId, setExportingId] = useState<string | null>(null)

  const fetchList = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await getUsulanSelesai({
        page, limit: 10,
        search: search || undefined,
      })
      const body = res.data
      setData(Array.isArray(body) ? body : body.data ?? [])
      setMeta(body.meta ?? body.pagination ?? { page, limit: 10, total: 0, totalPages: 0 })
    } catch (err: unknown) {
      setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal memuat data' : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }, [page, search])

  useEffect(() => { fetchList() }, [fetchList])

  const handleSearch = () => { setPage(1); fetchList() }

  const handleExportExcel = async (item: UsulanItem) => {
    setExportingId(item.id)
    try {
      const res = await getUsulanDetail(item.id)
      const detailData = res.data?.data || res.data
      await exportToExcel(detailData)
    } catch {
      alert('Gagal mengekspor Excel. Pastikan data dan gambar tanda tangan valid, lalu coba lagi.')
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">Hasil Evaluasi</h2>
          <p className="text-sm text-gray-500">Penilaian Tahap 1 — Usulan dengan status Selesai Evaluasi</p>
        </div>
        <button onClick={fetchList} className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50">
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          Refresh Data
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-500">Cari</label>
          <div className="relative">
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Cari inovasi / PIC..." className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <button onClick={handleSearch} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">Cari</button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="border-b px-4 py-4 sm:px-6">Tanggal Masuk</th>
                <th className="border-b px-4 py-4 sm:px-6">Asal Satker</th>
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
                <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-gray-400">Belum ada usulan dengan status Selesai Evaluasi</td></tr>
              ) : (
                data.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-blue-50/50">
                    <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{formatDate(item.createdAt || item.created_at || item.tanggal_masuk)}</td>
                    <td className="px-4 py-3.5 text-gray-600 sm:px-6 font-medium text-blue-900">{item.nama_satker || item.satker?.nama_satker || item.user?.satker?.nama_satker || '-'}</td>
                    <td className="px-4 py-3.5 text-gray-800 font-medium sm:px-6">{item.judul || item.nama_inovasi}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-gray-600 sm:px-6">{item.pic_nama || item.penanggung_jawab || '-'}</td>
                    <td className="whitespace-nowrap px-4 py-3.5 sm:px-6">
                      <span className="inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">{item.status}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right sm:px-6">
                      <div className="flex items-center justify-end gap-1">
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
        <Paginator meta={meta} onPage={(p) => setPage(p)} />
      </div>
    </div>
  )
}
