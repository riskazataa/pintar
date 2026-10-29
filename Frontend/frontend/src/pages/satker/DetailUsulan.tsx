import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getUsulanDetail } from '../../services/inovasi.service'

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
  PERBAIKAN: 'bg-purple-100 text-purple-700 border-purple-200',
  SELESAI_EVALUASI: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function buildTreeStructure(answers: any[]) {
  const parents = answers.filter((a: any) => !a.question?.parent_id)
  return parents.flatMap((parent: any, pIdx: number) => {
    const children = answers.filter((a: any) => a.question?.parent_id === parent.question?.id)
    const parentRow = { ans: parent, prefix: `${pIdx + 1}.`, isChild: false }
    const childRows = children.map((child: any, cIdx: number) => ({
      ans: child, 
      prefix: `${String.fromCharCode(97 + cIdx)}.`, // a, b, c
      isChild: true,
    }))
    return [parentRow, ...childRows]
  })
}

export default function DetailUsulan() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    getUsulanDetail(id)
      .then((res) => setData(res.data?.data || res.data))
      .catch(() => alert('Gagal memuat detail usulan'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        <svg className="h-8 w-8 animate-spin text-blue-600 mr-3" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        Memuat detail inovasi...
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-red-500">
        Data tidak ditemukan. 
        <button onClick={() => navigate('/satker/usulan')} className="text-blue-500 underline font-semibold ml-2">Kembali ke Daftar</button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/satker/usulan')} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{data.judul}</h2>
            <p className="text-sm text-gray-500">• Didaftarkan {formatDate(data.created_at)}</p>
          </div>
        </div>
        <div className={`rounded-full border px-4 py-1.5 text-sm font-semibold tracking-wide ${STATUS_BADGE[data.status] || 'bg-gray-100 text-gray-600'}`}>
          Status: {data.status}
        </div>
      </div>

      {data.status === 'PERBAIKAN' && data.catatan_perbaikan && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <svg className="mt-0.5 h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <div><strong>Catatan Perbaikan dari Tim Penilai:</strong> {data.catatan_perbaikan}</div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        
        {/* KOLOM KIRI (Info Utama) */}
        <div className="space-y-6 lg:col-span-4 sticky top-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
            <h3 className="text-base font-bold text-gray-800 border-b pb-3">Informasi Utama</h3>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Jenis Inovasi</p>
              <p className="text-sm font-medium text-gray-900">{data.jenis_inovasi} {data.jenis_inovasi_lainnya ? `(${data.jenis_inovasi_lainnya})` : ''}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tahun Inovasi</p>
              <p className="text-sm font-medium text-gray-900">{data.tahun}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Kriteria Inovasi</p>
              <div className="flex flex-wrap gap-1.5">
                {data.kriteria_inovasi?.map((k: string, i: number) => (
                  <span key={i} className="rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 border border-blue-100">{k}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Link Data Dukung</p>
              <a href={data.link_data_dukung} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline break-all bg-blue-50/50 p-2 rounded-lg border border-dashed border-blue-200">
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                {data.link_data_dukung}
              </a>
            </div>
          </div>
        </div>

        {/* KOLOM KANAN (Hasil Assessment Table) */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-4 border-b pb-4">
            <h3 className="font-bold text-lg text-gray-800">Hasil Self Assessment</h3>
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              Total {data.assessment_answers?.length || 0} Pertanyaan
            </span>
          </div>

          <div className="space-y-2">
            {data.assessment_answers && data.assessment_answers.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <table className="w-full text-left text-sm text-gray-600">
                  <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-500 font-bold">
                    <tr>
                      <th className="px-6 py-4 w-16 text-center">NO</th>
                      <th className="px-6 py-4">KRITERIA PENILAIAN</th>
                      <th className="px-6 py-4 w-28 text-center">JAWABAN</th>
                      <th className="px-6 py-4 w-64">CATATAN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {buildTreeStructure(data.assessment_answers).map(({ ans, prefix, isChild }) => (
                      <tr key={ans.id} className={`transition-colors hover:bg-gray-50 ${isChild ? 'bg-gray-50/30' : ''}`}>
                        
                        {/* Kolom Nomor */}
                        <td className={`px-6 py-4 align-top font-medium text-center ${isChild ? 'text-gray-400' : 'text-gray-800'}`}>
                          {prefix}
                        </td>
                        
                        {/* Kolom Pertanyaan */}
                        <td className={`px-6 py-4 align-top ${isChild ? 'text-gray-600 pl-8' : 'font-bold text-gray-800'}`}>
                          {ans.question?.pertanyaan}
                        </td>
                        
                        {/* Kolom Badge YA/TIDAK */}
                        <td className="px-6 py-4 align-top text-center">
                          <span className={`inline-flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-bold border ${
                            ans.jawaban_boolean 
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}>
                            {ans.jawaban_boolean ? 'YA' : 'TIDAK'}
                          </span>
                        </td>
                        
                        {/* Kolom Catatan */}
                        <td className="px-6 py-4 align-top">
                          <span className={`text-sm ${ans.catatan_string ? 'text-gray-700' : 'text-gray-400 italic'}`}>
                            {ans.catatan_string || '- Tidak ada catatan -'}
                          </span>
                        </td>
                        
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-10 text-sm text-gray-400 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
                Belum ada data assessment yang dilampirkan.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}