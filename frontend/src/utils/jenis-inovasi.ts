export function formatJenisInovasi(data: {
  jenis_inovasi?: string | null
  jenis_inovasi_pilihan?: string[] | null
  jenis_inovasi_lainnya?: string | null
}): string {
  const choices = data.jenis_inovasi_pilihan?.length
    ? data.jenis_inovasi_pilihan
    : data.jenis_inovasi ? [data.jenis_inovasi] : []
  return choices.map((choice) => choice === 'Lainnya' && data.jenis_inovasi_lainnya
    ? data.jenis_inovasi_lainnya
    : choice).join(', ') || '—'
}
