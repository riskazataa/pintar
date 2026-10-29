import { useState, useCallback } from 'react'
import { assignPenilai } from '../services/inovasi.service'

type Penilai = { id: number; nama_lengkap: string }

export function useAssignPenilai(
  inovasiId: number,
  initialPenilai: Penilai[],
  onSuccess?: (penilai: Penilai[]) => void,
) {
  const [penilai, setPenilai] = useState<Penilai[]>(initialPenilai)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleAssignSubmit = useCallback(
    async (selectedIds: number[]) => {
      const prev = [...penilai]
      const newPenilai = selectedIds
        .map((id) => initialPenilai.find((p) => p.id === id) ?? { id, nama_lengkap: '...' })
        .filter(Boolean) as Penilai[]

      setPenilai(newPenilai)
      setLoading(true)
      setError(null)

      try {
        const { data } = await assignPenilai(inovasiId, selectedIds)
        const updatedPenilai: Penilai[] =
          data?.penilai?.map((p: any) => ({ id: p.id, nama_lengkap: p.nama_lengkap })) ?? []
        setPenilai(updatedPenilai)
        onSuccess?.(updatedPenilai)
      } catch (err: any) {
        setPenilai(prev)
        const msg =
          err?.response?.data?.message || err?.message || 'Gagal menyimpan penugasan penilai'
        setError(msg)
        alert(msg)
      } finally {
        setLoading(false)
      }
    },
    [inovasiId, penilai, initialPenilai, onSuccess],
  )

  return { penilai, setPenilai, loading, error, handleAssignSubmit }
}
