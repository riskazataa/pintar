export interface StatusPresentationInput {
  status?: string | null
  hasil_penilaian?: string | null
  hasil_penilaian_tahap1?: string | null
  hasil_penilaian_tahap2?: string | null
  penilai?: { id: string | number }[]
  penilai_tahap2?: { id: string | number }[]
  assigned_users?: { id: string | number }[]
  usulan_signatures?: { user_id: string | number; tahap?: number; keputusan?: string | null }[]
  signatures?: { user_id: string | number; tahap?: number; keputusan?: string | null }[]
}

export interface StatusPresentation {
  label: string
  className: string
}

const STYLES: Record<string, string> = {
  Draft: 'border-slate-200 bg-slate-100 text-slate-600',
  'Sedang Direview': 'border-amber-200 bg-amber-50 text-amber-700',
  'Menunggu Tanda Tangan': 'border-blue-200 bg-blue-50 text-blue-700',
  Lolos: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  'Tidak Lolos': 'border-rose-200 bg-rose-50 text-rose-700',
  'Perlu Perbaikan': 'border-violet-200 bg-violet-50 text-violet-700',
}

export function getStatusPresentation(item: StatusPresentationInput, tahap = 1): StatusPresentation {
  if (tahap === 1 && item.status === 'SELESAI_EVALUASI' && item.hasil_penilaian_tahap2) {
    const finalOutcome = item.hasil_penilaian_tahap2
    return finalOutcome === 'LOLOS'
      ? { label: 'Lolos', className: STYLES.Lolos }
      : { label: 'Tidak Lolos', className: STYLES['Tidak Lolos'] }
  }
  const outcome = tahap === 2
    ? item.hasil_penilaian_tahap2 ?? item.hasil_penilaian
    : item.hasil_penilaian_tahap1 ?? item.hasil_penilaian
  if (outcome === 'LOLOS') return { label: 'Lolos', className: STYLES.Lolos }
  if (outcome === 'TIDAK_LOLOS') return { label: 'Tidak Lolos', className: STYLES['Tidak Lolos'] }

  const status = item.status || ''
  if (status === 'DRAFT') return { label: 'Draft', className: STYLES.Draft }
  if (status === 'PERBAIKAN') return { label: 'Perlu Perbaikan', className: STYLES['Perlu Perbaikan'] }
  if (status === 'REJECTED') return { label: 'Tidak Lolos', className: STYLES['Tidak Lolos'] }
  const assigned = tahap === 2 ? item.penilai_tahap2 ?? item.penilai ?? item.assigned_users : item.penilai ?? item.assigned_users
  const assignedIds = new Set((assigned ?? []).map((reviewer) => String(reviewer.id)))
  const signatures = (item.usulan_signatures ?? item.signatures ?? []).filter((signature) => signature.tahap === undefined || signature.tahap === tahap)
  const signedCount = signatures.filter((signature) => assignedIds.has(String(signature.user_id))).length
  if (signedCount > 0 && signedCount < assignedIds.size) {
    return { label: 'Sedang Direview', className: STYLES['Sedang Direview'] }
  }
  if (status === 'APPROVED' || status === 'SELESAI_EVALUASI') {
    return { label: 'Menunggu Tanda Tangan', className: STYLES['Menunggu Tanda Tangan'] }
  }

  if (status === 'PENDING' || !status) return { label: 'Sedang Direview', className: STYLES['Sedang Direview'] }
  return { label: status.replaceAll('_', ' '), className: 'border-gray-200 bg-gray-50 text-gray-600' }
}
