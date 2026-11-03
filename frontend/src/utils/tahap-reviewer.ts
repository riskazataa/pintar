export function getReviewerStageName(tahap: number): string {
  return tahap === 1 ? 'Seleksi Awal' : 'Penilaian Akhir'
}
