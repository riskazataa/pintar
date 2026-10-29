const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const ExcelJS = require('exceljs')

async function main() {
  const source = fs.readFileSync('src/utils/resultExcel.ts', 'utf8')
  const start = source.indexOf('function exportToExcel(')
  const code = source.slice(start)
  const js = ts.transpile(code, { target: ts.ScriptTarget.ES2022 })
  let receive
  const saved = new Promise(resolve => { receive = resolve })
  const exportExcel = new Function('ExcelJS', 'saveAs', `${js}; return exportToExcel`)(ExcelJS, receive)
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/RsAAAAASUVORK5CYII='
  const signatures = ['SKI', 'Timker Manajemen Risiko', 'Reformasi Birokrasi', 'Monev'].map((role, i) => ({ role, nama: `Penanda ${i}`, nip: `${100 + i}`, ttd_image: image }))
  await exportExcel({ judul: 'Uji Hasil', stage_number: 2, signatures, assessment_answers: [
    { question_id: 1, question: { id: 1, pertanyaan: 'Orisinil', parent_id: null }, jawaban_boolean: true, catatan_string: 'Catatan induk', link: 'https://example.com/induk' },
    { question_id: 2, question: { id: 2, pertanyaan: 'Bukti', parent_id: 1 }, jawaban_boolean: false, catatan_string: 'Catatan anak', link: 'https://example.com/anak' },
  ] })
  const blob = await saved
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.getCell('A1').value, 'Form Seleksi Awal Penilaian Inovasi')
  assert.equal(sheet.getCell('D6').value, 'Catatan')
  assert.equal(sheet.getCell('E6').value, 'Link')
  assert.equal(sheet.getCell('D7').value, 'Catatan induk')
  assert.equal(sheet.getCell('E7').hyperlink, 'https://example.com/induk')
  assert.equal(sheet.getCell('E8').hyperlink, 'https://example.com/anak')
  assert.equal(sheet.getCell('A1').font.name, 'Times New Roman')
  assert.equal(sheet.getColumn(2).width, 55)
  assert.equal(sheet.getImages().length, signatures.length, 'Setiap tanda tangan harus tertanam di Excel')
  const values = JSON.stringify(sheet.model.rows)
  for (const signature of signatures) {
    assert.ok(values.includes(signature.role))
    assert.ok(values.includes(signature.nama))
    assert.ok(values.includes(`NIP. ${signature.nip}`))
  }
  console.log('PASS: format Excel, link induk/anak, gambar tanda tangan, jabatan, nama, dan NIP tersimpan di XLSX')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
