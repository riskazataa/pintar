const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const ExcelJS = require('exceljs')

async function main() {
  const source = fs.readFileSync('src/pages/tim-penilai/Tahap1Hasil.tsx', 'utf8')
  const start = source.indexOf('function exportToExcel(')
  const code = source.slice(start, source.indexOf('export default function'))
  const js = ts.transpile(code, { target: ts.ScriptTarget.ES2022 })
  let receive
  const saved = new Promise(resolve => { receive = resolve })
  const exportExcel = new Function('ExcelJS', 'saveAs', `${js}; return exportToExcel`)(ExcelJS, receive)
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/RsAAAAASUVORK5CYII='
  const signatures = ['SKI', 'Timker Manajemen Risiko', 'Reformasi Birokrasi', 'Monev'].map((role, i) => ({ role, nama: `Penanda ${i}`, nip: `${100 + i}`, ttd_image: image }))
  await exportExcel({ judul: 'Uji Hasil', signatures })
  const blob = await saved
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await blob.arrayBuffer())
  const sheet = workbook.worksheets[0]
  assert.equal(sheet.getImages().length, signatures.length, 'Setiap tanda tangan harus tertanam di Excel')
  const values = JSON.stringify(sheet.model.rows)
  for (const signature of signatures) {
    assert.ok(values.includes(signature.role))
    assert.ok(values.includes(signature.nama))
    assert.ok(values.includes(`NIP. ${signature.nip}`))
  }
  console.log('PASS: seluruh gambar tanda tangan, jabatan, nama, dan NIP tersimpan di XLSX')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
