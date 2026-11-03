export const CONCLUSION_MARKER = '__FINAL_CONCLUSION__'
export const CONCLUSION_OPTIONS = ['Tidak ada inovasi nilai 0', 'Diterima sebagai inovasi, dapat dihargai 0,5', 'Diterima sebagai inovasi percontohan nasional nilai 1', 'Lainnya']
export function conclusionText(answer: any) {
  const values = answer.custom_values ?? {}
  return values.__kesimpulan === 'Lainnya' ? `Lainnya: ${values.__kesimpulan_catatan || ''}` : values.__kesimpulan || 'Belum diisi'
}
