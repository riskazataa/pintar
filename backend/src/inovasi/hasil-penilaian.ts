export function hasilPenilaian(penilai: { id: number }[], signatures: { user_id: number; tahap: number; keputusan?: string | null }[], tahap = 1) {
  const votes = penilai.map((p) => signatures.find((s) => s.tahap === tahap && s.user_id === p.id)?.keputusan);
  if (!votes.length || votes.some((v) => v !== 'LOLOS' && v !== 'TIDAK_LOLOS')) return null;
  return votes.filter((v) => v === 'LOLOS').length > votes.length / 2 ? 'LOLOS' : 'TIDAK_LOLOS';
}

export function statusPenilaian(
  status: string | null | undefined,
  penilai: { id: number }[],
  signatures: { user_id: number; tahap: number; keputusan?: string | null }[],
  tahap = 1,
) {
  const hasil = hasilPenilaian(penilai, signatures, tahap);
  if (hasil) return hasil;
  if (status === 'REJECTED') return 'TIDAK_LOLOS';
  if (status === 'PERBAIKAN') return 'PERBAIKAN';

  const assignedIds = new Set(penilai.map((reviewer) => reviewer.id));
  const signedCount = signatures.filter(
    (signature) => signature.tahap === tahap && assignedIds.has(signature.user_id),
  ).length;
  if (signedCount > 0 && signedCount < assignedIds.size) return 'SEDANG_DIREVIEW';
  if (status === 'APPROVED' || status === 'SELESAI_EVALUASI') return 'MENUNGGU_TTD';
  return 'SEDANG_DIREVIEW';
}
