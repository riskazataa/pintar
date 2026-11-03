import type ExcelJS from 'exceljs'

export function addFinalSignatures(book: ExcelJS.Workbook, sheet: ExcelJS.Worksheet, count: number, startRow: number, signatures: any[], dateText = '') {
  const split = Math.max(2, Math.floor(count / 2))
  const last = Math.max(count, split + 1)
  const groups = new Map<string, any[]>()
  signatures.forEach((signature) => {
    const savedRole = (signature.jabatan || signature.role || 'Penanda tangan').trim()
    const role = /^roren$/i.test(savedRole) ? 'Biro Perencanaan' : savedRole
    groups.set(role, [...(groups.get(role) ?? []), signature])
  })
  // Urutan kolom mengikuti format BA: unit di kiri, tim penilai/perencanaan di kanan.
  const leftOrder = ['Petugas Unit Eselon 1', 'Ketua Tim Kerja Marvel', 'Ketua Tim Kerja Monev I Biro Perencanaan']
  const rightOrder = ['Dalnis Itjen', 'Ketua Tim Itjen', 'Anggota Tim Itjen', 'Biro Perencanaan']
  const left = [...groups.keys()].filter((role) => role.startsWith('Petugas BKK (')).sort()
  left.push(...leftOrder.filter((role) => groups.has(role)))
  const right = rightOrder.filter((role) => groups.has(role))
  right.push(...[...groups.keys()].filter((role) => !left.includes(role) && !right.includes(role)))
  const text = (row: number, from: number, to: number, value: string, bold = false) => {
    if (to > from) sheet.mergeCells(row, from, row, to)
    const cell = sheet.getCell(row, from)
    cell.value = value
    cell.font = { name: 'Arial', size: 10, bold }
    cell.alignment = { wrapText: true, vertical: 'middle' }
  }
  text(startRow, split + 1, last, dateText, true)
  sheet.getRow(startRow).height = 24
  for (const [roles, from, to] of [[left, 1, split], [right, split + 1, last]] as const) {
    let row = startRow + 2
    for (const role of roles) {
      text(row, from, to, `${role} :`, true)
      sheet.getRow(row++).height = 28
      const members = groups.get(role)!
      const compact = role === 'Petugas Unit Eselon 1'
      members.forEach((signature, index) => {
        const imageRow = row
        const name = `${members.length > 1 ? `${index + 1}. ` : ''}${signature.nama || signature.user?.nama_lengkap || '-'}`
        const textHeight = Math.max(1, Math.ceil(name.length / 55)) * 14
        const compactHeight = textHeight + 26
        if (!compact) { text(row, from, to, ''); sheet.getRow(row++).height = 40 }
        text(row, from, to, name)
        if (compact) sheet.getCell(row, from).alignment = { wrapText: true, vertical: 'top' }
        sheet.getRow(row++).height = compact ? compactHeight : Math.max(22, textHeight)
        text(row, from, to, `NIP ${signature.nip || '-'}`)
        sheet.getRow(row++).height = 20
        const image = signature.ttd_image || signature.signature_data
        const match = /^data:image\/(png|jpe?g|gif);base64,/i.exec(image || '')
        if (match) {
          const extension = match[1].toLowerCase() === 'jpg' ? 'jpeg' : match[1].toLowerCase() as 'png' | 'jpeg' | 'gif'
          const imageId = book.addImage({ base64: image, extension })
          sheet.addImage(imageId, { tl: { col: compact ? to - 0.45 : from - 1 + 0.08, row: imageRow - 1 + (compact ? textHeight / compactHeight : 0) }, ext: { width: compact ? 80 : 135, height: compact ? 28 : 48 } })
        }
        if (!compact) row++
      })
      row++
    }
  }
}
