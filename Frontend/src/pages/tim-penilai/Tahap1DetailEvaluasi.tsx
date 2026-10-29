import { useEffect, useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  getUsulanDetail, 
  updateAssessmentAnswers, 
  kembalikanUsulan, 
  simpanTandaTangan 
} from '../../services/inovasi.service';

function getUser() {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

const STATUS_BADGE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-rose-100 text-rose-700 border-rose-200',
  PERBAIKAN: 'bg-purple-100 text-purple-700 border-purple-200',
  SELESAI_EVALUASI: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function formatDate(dateStr?: string) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('id-ID', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

// Fungsi untuk menyusun tree
function buildTreeStructure(answers: any[]) {
  const parents = answers.filter((a: any) => !a.question?.parent_id);
  return parents.flatMap((parent: any, pIdx: number) => {
    const children = answers.filter((a: any) => a.question?.parent_id === parent.question?.id);
    const parentRow = { ans: parent, prefix: `${pIdx + 1}.`, isChild: false };
    const childRows = children.map((child: any, cIdx: number) => ({
      ans: child,
      prefix: `${String.fromCharCode(97 + cIdx)}.`, // a., b., c.
      isChild: true,
    }));
    return [parentRow, ...childRows];
  });
}

export default function Tahap1DetailEvaluasi() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [localAnswers, setLocalAnswers] = useState<Record<string, { jawaban_boolean: boolean; catatan_string: string }>>({});
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // State Modal Perbaikan
  const [perbaikanModal, setPerbaikanModal] = useState(false);
  const [alasanPerbaikan, setAlasanPerbaikan] = useState('');
  const [submittingPerbaikan, setSubmittingPerbaikan] = useState(false);

  // State Tanda Tangan
  const [selectedRole, setSelectedRole] = useState('');
  const [namaVerifikator, setNamaVerifikator] = useState('');
  const [nipTtd, setNipTtd] = useState('');
  const [jabatanTtd, setJabatanTtd] = useState('');
  const [signing, setSigning] = useState(false);
  const sigPad = useRef<SignatureCanvas>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const initLocalAnswers = (assessmentAnswers: any[]) => {
    const init: Record<string, { jawaban_boolean: boolean; catatan_string: string }> = {};
    assessmentAnswers.forEach((ans: any) => {
      init[ans.id] = { 
        jawaban_boolean: ans.jawaban_boolean ?? false, 
        catatan_string: ans.catatan_string || '' 
      };
    });
    setLocalAnswers(init);
    setChanged(false);
  };

  useEffect(() => {
    if (!id) return;
    getUsulanDetail(id)
      .then((res) => {
        const detail = res.data?.data || res.data;
        setData(detail);
        if (detail?.assessment_answers) initLocalAnswers(detail.assessment_answers);
      })
      .catch(() => alert('Gagal memuat detail usulan'))
      .finally(() => setLoading(false));
  }, [id]);
  
  useEffect(() => {
    const user = getUser();
    setCurrentUser(user);
  }, []);

  const handleCheckChange = (answerId: string, checked: boolean) => {
    setLocalAnswers((prev) => ({ ...prev, [answerId]: { ...prev[answerId], jawaban_boolean: checked } }));
    setChanged(true);
  };

  const handleCatatanChange = (answerId: string, value: string) => {
    setLocalAnswers((prev) => ({ ...prev, [answerId]: { ...prev[answerId], catatan_string: value } }));
    setChanged(true);
  };

  const handleBatalEdit = () => {
    if (data?.assessment_answers) initLocalAnswers(data.assessment_answers);
    setIsEditing(false);
  };

  const handleSimpan = async () => {
    if (!id || !data?.assessment_answers) return;
    setSaving(true);
    try {
      const answersPayload = data.assessment_answers.map((ans: any) => {
        const local = localAnswers[ans.id];
        return {
          id: ans.id, 
          question_id: ans.question_id,
          jawaban_boolean: local ? local.jawaban_boolean : ans.jawaban_boolean,
          catatan_string: local ? local.catatan_string : (ans.catatan_string || ''),
        };
      });
      await updateAssessmentAnswers(id, { assessment_answers: answersPayload });
      
      setData((prev: any) => ({
        ...prev,
        assessment_answers: prev.assessment_answers.map((a: any) => ({
          ...a, 
          jawaban_boolean: localAnswers[a.id]?.jawaban_boolean, 
          catatan_string: localAnswers[a.id]?.catatan_string
        }))
      }));
      
      setChanged(false);
      setIsEditing(false);
      alert('Perubahan berhasil disimpan.');
    } catch (err: unknown) {
      alert(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan perubahan' : 'Terjadi kesalahan');
    } finally {
      setSaving(false);
    }
  };

  const handleSimpanTandaTangan = async () => {
    if (!id || !selectedRole || !nipTtd.trim()) return alert('Harap isi semua field.'); // namaVerifikator tidak wajib dikirim ke backend, hanya untuk display UI
    if (!sigPad.current || sigPad.current.isEmpty()) return alert('Harap buat tanda tangan.');

    setSigning(true);
    try {
      const ttdImage = sigPad.current.getCanvas().toDataURL('image/png');
      
      // SESUAIKAN PAYLOAD DENGAN PERMINTAAN BACKEND
      await simpanTandaTangan(id, { 
        usulan_inovasi_id: Number(id),     // Tambahkan ini, dan pastikan jadi tipe Number
        user_id: Number(selectedRole),     // Convert string selectedRole menjadi Number
        jabatan: jabatanTtd.trim(),        // Biarkan jika backend memang meminta ini
        nip: nipTtd.trim(),                // Biarkan jika backend memang meminta ini
        signature_data: ttdImage           // Ubah nama dari ttd_image menjadi signature_data
      });
      
      const res = await getUsulanDetail(id); // Force refresh data
      setData(res.data?.data || res.data);

      setSelectedRole(''); 
      setNamaVerifikator(''); 
      setNipTtd(''); 
      setJabatanTtd(''); 
      sigPad.current.clear();
      alert('Tanda tangan berhasil disimpan.');
    } catch (err: unknown) {
      alert(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan tanda tangan' : 'Terjadi kesalahan');
    } finally {
      setSigning(false);
    }
  };

  const handleKembalikan = async () => {
    if (!id || !alasanPerbaikan.trim()) return alert('Harap isi alasan perbaikan.');
    setSubmittingPerbaikan(true);
    try {
      await kembalikanUsulan(id, alasanPerbaikan.trim());
      alert('Usulan dikembalikan untuk perbaikan.');
      navigate('/tim-penilai/tahap-1/evaluasi');
    } catch (err) { 
      alert('Gagal mengembalikan usulan');
    } finally {
      setSubmittingPerbaikan(false); 
      setPerbaikanModal(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px] text-gray-500 font-medium">Memuat detail inovasi...</div>;
  if (!data) return <div className="flex items-center justify-center min-h-[400px] text-rose-500 font-medium">Data tidak ditemukan.</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header Info */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white p-6 shadow-sm border border-gray-100 transition-all">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/tim-penilai/tahap-1/evaluasi')} 
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 leading-tight">{data.judul}</h2>
            <p className="text-sm text-gray-500 mt-1">Didaftarkan pada {formatDate(data.created_at)}</p>
          </div>
        </div>
        <div className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold tracking-wide ${STATUS_BADGE[data.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
          {data.status}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* KOLOM KIRI (Info Utama & Satker) */}
        <div className="space-y-6 lg:col-span-4 lg:sticky lg:top-6">
          
          {/* Card Informasi Utama */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
            <h3 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-3">Informasi Utama</h3>
            
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
              <div className="flex flex-wrap gap-2">
                {data.kriteria_inovasi?.map((k: string, i: number) => (
                  <span key={i} className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 border border-blue-100">
                    {k}
                  </span>
                ))}
              </div>
            </div>
            
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Link Data Dukung</p>
              <a 
                href={data.link_data_dukung} 
                target="_blank" 
                rel="noreferrer" 
                className="inline-flex w-full items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-100 break-all bg-blue-50/50 p-3 rounded-xl border border-dashed border-blue-200 transition-colors"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                {data.link_data_dukung}
              </a>
            </div>
          </div>

          {/* Card PIC & Instansi */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
            <div>
              <h3 className="mb-4 text-sm font-bold text-gray-800">Penanggung Jawab (PIC)</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 border border-gray-100">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <i className="fa-solid fa-user text-sm"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Nama Lengkap</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{data.pic_nama}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 border border-gray-100">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <i className="fa-brands fa-whatsapp text-sm"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-500 uppercase font-bold">No. Telepon / WA</p>
                    <p className="text-sm font-bold text-gray-900 truncate">{data.pic_telp}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="pt-4 border-t border-gray-100">
              <h3 className="mb-4 text-sm font-bold text-gray-800">Asal Instansi</h3>
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 border border-gray-100">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                  <i className="fa-regular fa-building text-sm"></i>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Satuan Kerja</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{data.satker?.nama_satker || '-'}</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* KOLOM KANAN (Form Assessment & Aksi) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
              <h3 className="text-lg font-bold text-gray-800">Self Assessment</h3>
              <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                Total {data.assessment_answers?.length || 0} Pertanyaan
              </span>
            </div>

            <div className="space-y-4">
              {data.assessment_answers && data.assessment_answers.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <table className="w-full text-left text-sm text-gray-600 whitespace-nowrap md:whitespace-normal">
                    <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase text-gray-600 font-bold">
                      <tr>
                        <th className="px-5 py-4 w-12 text-center">No</th>
                        <th className="px-5 py-4 min-w-[250px]">Kriteria Penilaian</th>
                        <th className="px-5 py-4 w-20 text-center">Ya</th>
                        <th className="px-5 py-4 min-w-[200px]">Catatan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {buildTreeStructure(data.assessment_answers).map(({ ans, prefix, isChild }) => {
                        const local = localAnswers[ans.id] || { jawaban_boolean: false, catatan_string: '' };
                        return (
                          <tr key={ans.id} className={`transition-colors ${isChild ? 'bg-gray-50/50' : ''} ${isEditing ? 'hover:bg-blue-50/30' : 'hover:bg-gray-50'}`}>
                            <td className={`px-5 py-4 align-top font-medium text-center ${isChild ? 'text-gray-400' : 'text-gray-800'}`}>
                              {prefix}
                            </td>
                            <td className={`px-5 py-4 align-top leading-relaxed ${isChild ? 'text-gray-600 pl-8' : 'font-semibold text-gray-800'}`}>
                              {ans.question?.pertanyaan}
                            </td>
                            <td className="px-5 py-4 align-top text-center">
                              <input
                                type="checkbox"
                                checked={local.jawaban_boolean}
                                onChange={(e) => handleCheckChange(ans.id, e.target.checked)}
                                disabled={!isEditing}
                                className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                              />
                            </td>
                            <td className="px-5 py-4 align-top">
                              <textarea
                                rows={2}
                                placeholder={isEditing ? "Ketik catatan..." : "-"}
                                value={local.catatan_string}
                                onChange={(e) => handleCatatanChange(ans.id, e.target.value)}
                                disabled={!isEditing}
                                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none disabled:bg-transparent disabled:text-gray-600 disabled:border-transparent disabled:px-0 resize-none transition-all"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-sm text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                  <svg className="w-12 h-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Belum ada data assessment.
                </div>
              )}
            </div>
          </div>

          {/* Tombol Aksi */}
          <div className="flex flex-wrap items-center justify-end gap-3 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
            {!isEditing ? (
              <button 
                onClick={() => setIsEditing(true)} 
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Edit Assessment
              </button>
            ) : (
              <>
                <button 
                  onClick={handleBatalEdit} 
                  className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Batal
                </button>
                <button 
                  onClick={handleSimpan} 
                  disabled={saving || !changed} 
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-200 transition-all"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </>
            )}
            
            <div className="hidden sm:block w-px h-8 bg-gray-200 mx-1"></div>
            
            <button 
              onClick={() => setPerbaikanModal(true)} 
              disabled={saving || isEditing} 
              className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-amber-200 transition-all"
            >
              Kembalikan (Perbaikan)
            </button>
          </div>
        </div>
      </div>

      {/* SECTION TANDA TANGAN */}
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 mb-6">Tanda Tangan Elektronik</h3>
        
        {data.assigned_users?.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.assigned_users.map((user: any, idx: number) => {
              // 1. Logika pencarian diperbaiki menggunakan user_id yang unik
              const signature = data.signatures?.find(
                (s: any) => String(s.user_id) === String(user.id || user.user_id)
              );
              
              // 2. Tentukan nama dan NIP yang akan ditampilkan
              const namaTampil = signature ? signature.nama : (user.nama_lengkap || user.nama || user.user?.nama_lengkap || user.user?.nama || '-');
              const nipTampil = signature ? signature.nip : (user.nip || user.user?.nip || '-');
              
              return (
                <div 
                  key={idx} 
                  className="border border-gray-200 rounded-lg p-6 bg-gray-50 flex flex-col items-center justify-center text-center"
                >
                  {signature ? (
                    <div className="flex flex-col items-center space-y-1">
                      <p className="font-medium text-sm text-gray-700">{signature.jabatan || user.role}</p>
                      
                      <img 
                        src={signature.signature_data || signature.ttd_image} 
                        className="h-28 w-auto object-contain my-2" 
                        alt="Tanda Tangan"
                      />
                      
                      <p className="font-bold text-sm text-gray-900 underline decoration-1 underline-offset-4">
                        {namaTampil}{signature.gelar ? ` ${signature.gelar}` : ''}
                      </p>
                      <p className="text-xs text-gray-800">NIP {nipTampil}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center space-y-1 py-2 opacity-60">
                      <p className="font-medium text-sm text-gray-600">{user.jabatan || user.role || 'Verifikator'}</p>
                      
                      <div className="h-28 w-full flex items-center justify-center my-2 text-gray-400 text-xs italic">
                        (Belum ditandatangani)
                      </div>
                      
                      <p className="font-bold text-sm text-gray-600 underline decoration-1 underline-offset-4">
                        {namaTampil}
                      </p>
                      <p className="text-xs text-gray-500">NIP {nipTampil}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-gray-400">
            <p>Tidak ada penilai yang di-assign</p>
          </div>
        )}

        {/* Form Tambah Tanda Tangan (HANYA jika user login adalah penilai assigned && belum sign) */}
        {data.assigned_users?.some(
          (u: any) => 
            String(u.id || u.user_id) === String(currentUser?.id) || u.nip === currentUser?.nip || u.nama_lengkap === currentUser?.nama_lengkap
        ) && !data.signatures?.some(
          (s: any) => String(s.user_id) === String(currentUser?.id) || s.nip === currentUser?.nip || s.nama === currentUser?.nama_lengkap
        ) && (
          <div className="border-t border-gray-100 pt-6 mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-4">Form Pengisian Tanda Tangan</h4>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <select 
                  value={selectedRole} 
                  onChange={e => { 
                    setSelectedRole(e.target.value);
                    
                    // Cari user berdasarkan id atau user_id, sesuaikan dengan backend
                    const user = data.assigned_users?.find((u: any) => String(u.id) === e.target.value || String(u.user_id) === e.target.value);
                    
                    if (user) {
                      // Ambil nama dari properti nama_lengkap, atau nama, atau dari relasi user.nama_lengkap
                      setNamaVerifikator(user.nama_lengkap || user.nama || user.user?.nama_lengkap || user.user?.nama || '');
                      setNipTtd(user.nip || user.user?.nip || '');
                      setJabatanTtd(user.jabatan || user.user?.jabatan || '');
                    } else {
                      setNamaVerifikator('');
                      setNipTtd('');
                      setJabatanTtd('');
                    }
                  }} 
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
                >
                  <option value="">-- Pilih Verifikator --</option>
                  {data.assigned_users?.map((u: any, i: number) => {
                    // Tentukan value unik (id / user_id)
                    const val = u.id || u.user_id;
                    // Tentukan nama yang akan tampil
                    const namaTampil = u.nama_lengkap || u.nama || u.user?.nama_lengkap || u.user?.nama || 'Nama Tidak Ditemukan';
                    // Tentukan role/jabatan jika ada
                    const roleTampil = u.role || u.jabatan || u.user?.jabatan || '';

                    return (
                      <option key={i} value={val}>
                        {namaTampil} {roleTampil ? `(${roleTampil})` : ''}
                      </option>
                    );
                  })}
                </select>
                <input 
                  type="text" 
                  readOnly 
                  value={namaVerifikator} 
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm bg-gray-50 focus:outline-none focus:ring-2 focus-gray-500 transition-all"
                  placeholder="Nama otomatis dari verifikator"
                />
                <input 
                  type="text" 
                  placeholder="Sebagai / Jabatan" 
                  value={jabatanTtd} 
                  onChange={e => setJabatanTtd(e.target.value)} 
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
                />
                <input 
                  type="text" 
                  placeholder="NIP / No. Identitas" 
                  value={nipTtd} 
                  onChange={e => setNipTtd(e.target.value)} 
                  className="w-full border border-gray-300 p-2.5 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all"
                />
              </div>
              
              <div className="border border-gray-300 rounded-xl overflow-hidden bg-white">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs font-semibold text-gray-500">
                  Area Canvas Tanda Tangan
                </div>
                <SignatureCanvas 
                  ref={sigPad} 
                  penColor="black" 
                  canvasProps={{className: 'w-full h-48 cursor-crosshair'}} 
                />
              </div>
              
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={handleSimpanTandaTangan} 
                  disabled={signing} 
                  className="bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm disabled:opacity-50 transition-colors"
                >
                  {signing ? 'Menyimpan...' : 'Simpan Tanda Tangan'}
                </button>
                <button 
                  onClick={() => sigPad.current?.clear()} 
                  className="border border-gray-300 text-gray-600 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 hover:text-gray-900 transition-colors"
                >
                  Bersihkan Canvas
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL KEMBALIKAN (PERBAIKAN) */}
      {perbaikanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm px-4 p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <h2 className="text-lg font-bold text-gray-800">Kembalikan Usulan</h2>
              <button onClick={() => setPerbaikanModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Alasan Perbaikan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={alasanPerbaikan}
                onChange={(e) => setAlasanPerbaikan(e.target.value)}
                rows={5}
                placeholder="Jelaskan secara detail bagian mana yang perlu diperbaiki oleh Satker..."
                className="w-full rounded-xl border border-gray-300 p-3.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none transition-all"
              ></textarea>
              <p className="text-xs text-gray-500 mt-2">Catatan ini akan dikirimkan langsung ke dashboard Satuan Kerja.</p>
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => {
                  setPerbaikanModal(false); 
                  setAlasanPerbaikan('');
                }} 
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Batal
              </button>
              <button 
                onClick={handleKembalikan} 
                disabled={submittingPerbaikan || !alasanPerbaikan.trim()} 
                className="rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                {submittingPerbaikan ? 'Mengirim...' : 'Kirim ke Satker'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}