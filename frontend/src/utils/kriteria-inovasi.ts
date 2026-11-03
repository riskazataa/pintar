export const KRITERIA_PEMBARUAN = 'Pembaharuan / Orisinil / Modifikasi'

const KRITERIA_PEMBARUAN_LAMA = new Set([
  'kebaharuan',
  'kebaruan',
  'pembaruan',
  'pembaharuan',
  'orisinal',
  'orisinil',
  'modifikasi',
])

export function normalizeKriteriaInovasi(values?: string[] | null): string[] {
  if (!Array.isArray(values)) return []

  const normalized: string[] = []
  for (const value of values) {
    const label = String(value).trim()
    if (!label) continue
    const normalizedLabel = label.toLocaleLowerCase('id-ID')
    const isCombinedLegacyValue = /^(kebaharuan|kebaruan|pembaruan|pembaharuan)\s*\/\s*(orisinal|orisinil)\s*\/\s*modifikasi$/.test(normalizedLabel)
    const displayLabel = isCombinedLegacyValue || KRITERIA_PEMBARUAN_LAMA.has(normalizedLabel)
      ? KRITERIA_PEMBARUAN
      : label
    if (!normalized.includes(displayLabel)) normalized.push(displayLabel)
  }

  return normalized
}
