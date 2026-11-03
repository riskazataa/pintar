import type ExcelJS from 'exceljs'
import type { BAReportHeader } from '../services/inovasi.service'

export const BA_TABLE_START_ROW = 14

export async function addBAExcelHeader(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, columnCount: number, data: any, header: BAReportHeader = {}) {
  const count = Math.max(3, columnCount)
  sheet.mergeCells(1, 1, 5, count)
  for (let row = 1; row <= 5; row++) sheet.getRow(row).height = 16
  if (header.logo) {
    const extension = header.logo.startsWith('data:image/jpeg') ? 'jpeg' : 'png'
    const logo = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Logo BA tidak dapat dibaca'))
      img.src = header.logo!
    })
    const scale = Math.min(140 / logo.width, 100 / logo.height)
    const width = logo.width * scale
    const height = logo.height * scale
    const widths = Array.from({ length: count }, (_, index) => (sheet.getColumn(index + 1).width ?? 10) * 7)
    let offset = (widths.reduce((sum, value) => sum + value, 0) - width) / 2
    let col = 0
    while (col < widths.length - 1 && offset > widths[col]) { offset -= widths[col]; col++ }
    const id = workbook.addImage({ base64: header.logo, extension })
    sheet.addImage(id, { tl: { col: col + offset / widths[col], row: 0.1 }, ext: { width, height } })
  }
  for (const [row, value] of [[6, 'BERITA ACARA'], [7, header.title || 'DESK INOVASI IMPLEMENTASI SAKIP'], [8, header.dateText || '']] as const) {
    sheet.mergeCells(row, 1, row, count)
    const cell = sheet.getCell(row, 1)
    cell.value = value
    cell.font = { name: 'Arial', size: 11, bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    sheet.getRow(row).height = row === 7 ? Math.max(20, Math.ceil(value.length / 75) * 16) : 20
  }
  for (let col = 1; col <= count; col++) sheet.getCell(8, col).border = { bottom: { style: 'medium' } }
  const info = [
    ['Unit Utama', 'Ditjen Penanggulangan Penyakit'],
    ['Kantor Pusat / UPT', data.satker?.nama_satker || data.nama_satker || '-'],
    ['Nama Inovasi', data.judul || data.nama_inovasi || '-'],
  ]
  info.forEach(([label, value], index) => {
    const row = 10 + index
    sheet.mergeCells(row, 1, row, 2)
    if (count > 3) sheet.mergeCells(row, 3, row, count)
    sheet.getCell(row, 1).value = label
    sheet.getCell(row, 3).value = `: ${value}`
    for (let col = 1; col <= count; col++) {
      const cell = sheet.getCell(row, col)
      cell.font = { name: 'Arial', size: 10, bold: col < 3 || index === 0 }
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    }
    sheet.getRow(row).height = index === 2 ? Math.max(32, Math.ceil(value.length / 65) * 15) : 20
  })
  sheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '1:13',
  }
}
