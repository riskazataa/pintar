import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

export function exportToExcel(data: any) {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Berita Acara')

  worksheet.columns = [
    { header: '', key: 'no', width: 6 },
    { header: '', key: 'kriteria', width: 55 },
    { header: '', key: 'ya', width: 15 },
    { header: '', key: 'catatan', width: 45 },
    { header: '', key: 'link', width: 40 },
  ]

  const borderStyle: Partial<ExcelJS.Border> = { style: 'thin' }
  const allBorders = {
    top: borderStyle,
    left: borderStyle,
    bottom: borderStyle,
    right: borderStyle,
  }

  // Row 1: Title
  worksheet.mergeCells('A1:D1')
  const titleCell = worksheet.getCell('A1')
  titleCell.value = 'Form Seleksi Awal Penilaian Inovasi'
  titleCell.font = { bold: true, size: 14, name: 'Times New Roman' }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  worksheet.getRow(1).height = 30

  // Row 3: Nama Satker
  const satker =
    data.nama_satker ||
    data.satker?.nama_satker ||
    data.user?.satker?.nama_satker ||
    '-'
  worksheet.getCell('A3').value = `Satker: ${satker}`
  worksheet.getCell('A3').font = { size: 11, name: 'Times New Roman' }

  // Row 4: Nama Inovasi
  const judul = data.judul || data.nama_inovasi || '-'
  worksheet.getCell('A4').value = `Inovasi: ${judul}`
  worksheet.getCell('A4').font = { size: 11, name: 'Times New Roman' }

  // Row 6: Table Header
  const headerRow = worksheet.getRow(6)
  const headerValues = [
    'No',
    'Kriteria Penilaian Seleksi Awal',
    'Ya/Tidak (V)',
    'Catatan',
    'Link',
  ]
  headerValues.forEach((val, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = val
    cell.font = { bold: true, size: 10, name: 'Times New Roman' }
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: i === 1,
    }
    cell.border = allBorders
  })
  headerRow.height = 25

  // Data rows with hierarchical numbering (mulai baris 7)
  const answers = data.assessment_answers || []
  const parents = answers.filter((a: any) => !a.question?.parent_id)
  let totalDataRows = 0

  parents.forEach((parent: any, pIdx: number) => {
    const children = answers.filter(
      (a: any) => a.question?.parent_id === parent.question?.id,
    )

    // --- Parent row (bold) ---
    const parentRowNum = 7 + totalDataRows
    const parentRow = worksheet.getRow(parentRowNum)

    parentRow.getCell(1).value = pIdx + 1
    parentRow.getCell(1).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    }
    parentRow.getCell(1).font = {
      bold: true,
      size: 10,
      name: 'Times New Roman',
    }
    parentRow.getCell(1).border = allBorders

    parentRow.getCell(2).value = parent.question?.pertanyaan || '-'
    parentRow.getCell(2).alignment = { wrapText: true, vertical: 'middle' }
    parentRow.getCell(2).font = {
      bold: true,
      size: 10,
      name: 'Times New Roman',
    }
    parentRow.getCell(2).border = allBorders

    parentRow.getCell(3).value = parent.jawaban_boolean ? 'V' : ''
    parentRow.getCell(3).alignment = {
      horizontal: 'center',
      vertical: 'middle',
    }
    parentRow.getCell(3).font = {
      bold: true,
      size: 10,
      name: 'Times New Roman',
    }
    parentRow.getCell(3).border = allBorders

    parentRow.getCell(4).value = parent.catatan_string || ''
    parentRow.getCell(4).alignment = { vertical: 'middle', wrapText: true }
    parentRow.getCell(4).font = { size: 10, name: 'Times New Roman' }
    parentRow.getCell(4).border = allBorders

    const parentLink = parentRow.getCell(5)
    parentLink.value = parent.link
      ? { text: parent.link, hyperlink: parent.link }
      : ''
    parentLink.alignment = { vertical: 'middle', wrapText: true }
    parentLink.font = { size: 10, name: 'Times New Roman' }
    parentLink.border = allBorders
    totalDataRows++

    // --- Child rows (indented) ---
    children.forEach((child: any, cIdx: number) => {
      const childRowNum = 7 + totalDataRows
      const childRow = worksheet.getRow(childRowNum)

      childRow.getCell(1).value =
        `${pIdx + 1}.${String.fromCharCode(97 + cIdx)}`
      childRow.getCell(1).alignment = {
        horizontal: 'center',
        vertical: 'middle',
      }
      childRow.getCell(1).font = { size: 9, name: 'Times New Roman' }
      childRow.getCell(1).border = allBorders

      childRow.getCell(2).value =
        `    ${String.fromCharCode(97 + cIdx)}. ${child.question?.pertanyaan || '-'}`
      childRow.getCell(2).alignment = { wrapText: true, vertical: 'middle' }
      childRow.getCell(2).font = { size: 10, name: 'Times New Roman' }
      childRow.getCell(2).border = allBorders

      childRow.getCell(3).value = child.jawaban_boolean ? 'V' : ''
      childRow.getCell(3).alignment = {
        horizontal: 'center',
        vertical: 'middle',
      }
      childRow.getCell(3).font = { size: 10, name: 'Times New Roman' }
      childRow.getCell(3).border = allBorders

      childRow.getCell(4).value = child.catatan_string || ''
      childRow.getCell(4).alignment = { vertical: 'middle', wrapText: true }
      childRow.getCell(4).font = { size: 10, name: 'Times New Roman' }
      childRow.getCell(4).border = allBorders

      const childLink = childRow.getCell(5)
      childLink.value = child.link
        ? { text: child.link, hyperlink: child.link }
        : ''
      childLink.alignment = { vertical: 'middle', wrapText: true }
      childLink.font = { size: 10, name: 'Times New Roman' }
      childLink.border = allBorders

      totalDataRows++
    })
  })

  // Gunakan daftar tanda tangan dari tahap yang diekspor.
  const signatures = data.signatures ?? data.usulan_signatures ?? []
  const signStartRow = 9 + totalDataRows
  signatures.forEach((signature: any, index: number) => {
    const column = index % 2 === 0 ? 2 : 4
    const titleRow = signStartRow + Math.floor(index / 2) * 9
    const setText = (row: number, value: string, bold = false) => {
      const cell = worksheet.getRow(row).getCell(column)
      cell.value = value
      cell.font = { name: 'Times New Roman', size: 11, bold }
      cell.alignment = {
        horizontal: 'center',
        vertical: 'middle',
        wrapText: true,
      }
    }
    setText(titleRow, signature.role || '-', true)
    worksheet.getRow(titleRow).height = 30
    for (let row = titleRow + 1; row <= titleRow + 3; row++) {
      worksheet.getRow(row).height = 22
    }
    if (signature.ttd_image) {
      const match = /^data:image\/(png|jpe?g|gif);base64,/i.exec(
        signature.ttd_image,
      )
      if (!match) throw new Error('Format gambar tanda tangan tidak didukung')
      const extension =
        match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase()
      const imageId = workbook.addImage({
        base64: signature.ttd_image,
        extension: extension as 'png' | 'jpeg' | 'gif',
      })
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
    saveAs(
      blob,
      `BA_Inovasi_${judul}${data.stage_number ? `_Tahap_${data.stage_number}` : ''}.xlsx`,
    )
  })
}
