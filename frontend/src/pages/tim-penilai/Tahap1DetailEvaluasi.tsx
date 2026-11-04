import FinalSignatureForm from '../../components/FinalSignatureForm';
import BAAnswerGrid from './BAAnswerGrid';
import { getBAColumns } from '../../services/inovasi.service';
import type { BAColumn } from '../../services/inovasi.service';
import { useEffect, useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  getUsulanDetail,
  savePenilaian,
  downloadHasilEvaluasiPdf,
  kembalikanUsulan,
  simpanTandaTangan
} from '../../services/inovasi.service';
import { getStatusPresentation } from '../../utils/inovasi-status';
import { useNotifications } from '../../components/NotificationProvider';
import { formatJenisInovasi } from '../../utils/jenis-inovasi';
import { normalizeKriteriaInovasi } from '../../utils/kriteria-inovasi';
import { getReviewerStageName } from '../../utils/tahap-reviewer';

function getUser() {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

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

export default function Tahap1DetailEvaluasi({ tahap = 1, onUpdated }: { tahap?: number; onUpdated?: () => void }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useNotifications();

  const [questionTitle, setQuestionTitle] = useState('Kriteria Penilaian');
  const [columns, setColumns] = useState<BAColumn[]>([]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [localAnswers, setLocalAnswers] = useState<Record<string, any>>({});
  const [changed, setChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // State Modal Perbaikan
  const [perbaikanModal, setPerbaikanModal] = useState(false);
  const [alasanPerbaikan, setAlasanPerbaikan] = useState('');
  const [submittingPerbaikan, setSubmittingPerbaikan] = useState(false);

  // State Tanda Tangan
  const [keputusan, setKeputusan] = useState<'LOLOS' | 'TIDAK_LOLOS' | ''>('');
  const [nipTtd, setNipTtd] = useState('');
  const [jabatanTtd, setJabatanTtd] = useState('');
  const [signing, setSigning] = useState(false);
  const sigPad = useRef<SignatureCanvas>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const initLocalAnswers = (assessmentAnswers: any[]) => {
    const init: Record<string, any> = {};
    assessmentAnswers.forEach((ans: any) => {
      init[ans.id] = {
        jawaban_boolean: ans.jawaban_boolean ?? false,
        catatan_string: ans.catatan_string || '',
        link: ans.link || '',
        custom_values: ans.custom_values || {}
      };
    });
    setLocalAnswers(init);
    setChanged(false);
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setIsEditing(false);
    Promise.all([getUsulanDetail(id, tahap), getBAColumns(tahap)])
      .then(([res, cols]) => {
        setColumns(cols.data.columns);
        setQuestionTitle(cols.data.questionTitle || 'Kriteria Penilaian');
        const detail = res.data?.data || res.data;
        setData(detail);
        if (detail?.assessment_answers) initLocalAnswers(detail.assessment_answers);
      })
      .catch(() => notify('Gagal memuat detail usulan.', 'error'))
      .finally(() => setLoading(false));
  }, [id, tahap]);

  useEffect(() => {
    const user = getUser();
    setCurrentUser(user);
  }, []);

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

          question_id: ans.question_id,
          link: local?.link || '',
          custom_values: local?.custom_values || {},
          jawaban_boolean: local ? local.jawaban_boolean : ans.jawaban_boolean,
          catatan_string: local ? local.catatan_string : (ans.catatan_string || ''),
        };
      });
      await savePenilaian(id, answersPayload, tahap);

      const response = await getUsulanDetail(id, tahap);
      const refreshed = response.data?.data || response.data;
      setData(refreshed);
      onUpdated?.();
      initLocalAnswers(refreshed.assessment_answers ?? []);

      setChanged(false);
      setIsEditing(false);
      notify('Perubahan berhasil disimpan.', 'success');
    } catch (err: unknown) {
      notify(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan perubahan' : 'Terjadi kesalahan', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSimpanTandaTangan = async () => {
    if (!id || !nipTtd.trim() || !jabatanTtd.trim() || !keputusan) { notify('Harap isi semua field.', 'warning'); return; }
    if (!/^\d+$/.test(nipTtd)) { notify('NIP hanya boleh berisi angka.', 'warning'); return; }
    if (!sigPad.current || sigPad.current.isEmpty()) { notify('Harap buat tanda tangan.', 'warning'); return; }

    setSigning(true);
    try {
      const ttdImage = sigPad.current.getCanvas().toDataURL('image/png');

      await simpanTandaTangan(id, {
        usulan_inovasi_id: Number(id),
        user_id: Number(currentUser.id),
        jabatan: jabatanTtd.trim(),
        nip: nipTtd.trim(),
        keputusan,
        signature_data: ttdImage
      }, tahap);

      const res = await getUsulanDetail(id, tahap); // Force refresh data
      const refreshed = res.data?.data || res.data;
      setData(refreshed);
      onUpdated?.();
      initLocalAnswers(refreshed.assessment_answers ?? []);

      setKeputusan('');
      setNipTtd('');
      setJabatanTtd('');
      sigPad.current.clear();
      notify('Tanda tangan berhasil disimpan.', 'success');
    } catch (err: unknown) {
      notify(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan tanda tangan' : 'Terjadi kesalahan', 'error');
    } finally {
      setSigning(false);
    }
  };

  const handleKembalikan = async () => {
    if (!data?.assigned_users?.length) { notify('Belum ada tim penilai yang ditugaskan untuk inovasi ini.', 'warning'); return; }
    if (!id || !alasanPerbaikan.trim()) { notify('Harap isi alasan perbaikan.', 'warning'); return; }
    setSubmittingPerbaikan(true);
    try {
      await kembalikanUsulan(id, alasanPerbaikan.trim());
      notify('Usulan dikembalikan untuk perbaikan.', 'success');
      navigate(`/tim-penilai/usulan/${id}`);
    } catch (err) {
      notify('Gagal mengembalikan usulan.', 'error');
    } finally {
      setSubmittingPerbaikan(false);
      setPerbaikanModal(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px] text-gray-500 font-medium">Memuat detail inovasi...</div>;
  if (!data) return <div className="flex items-center justify-center min-h-[400px] text-rose-500 font-medium">Data tidak ditemukan.</div>;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {tahap === 2 && <button className="rounded-lg border bg-white px-4 py-2 text-sm" onClick={async () => {
        try {
          const res = await downloadHasilEvaluasiPdf(id!, tahap);
          const url = URL.createObjectURL(res.data);
          const link = document.createElement('a'); link.href = url; link.download = `BA_Penilaian_Akhir_${id}.pdf`; link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch { notify('Gagal mengunduh BA.', 'error') }
      }}>Unduh BA Penilaian Akhir</button>}
      {/* Header Info */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white p-6 shadow-sm border border-gray-100 transition-all">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/tim-penilai/usulan/${id}`)}
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
        <div className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold tracking-wide ${getStatusPresentation(data, tahap).className}`}>
          {getStatusPresentation(data, tahap).label}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 items-start">
        {/* KOLOM KIRI (Info Utama & Unit) */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">

          {/* Card Informasi Utama */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
            <h3 className="text-base font-bold text-gray-800 border-b border-gray-100 pb-3">Informasi Utama</h3>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Jenis Inovasi</p>
              <p className="text-sm font-medium text-gray-900">{formatJenisInovasi(data)}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Tahun Inovasi</p>
              <p className="text-sm font-medium text-gray-900">{data.tahun}</p>
            </div>

            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Kriteria Inovasi</p>
              <div className="flex flex-wrap gap-2">
                {normalizeKriteriaInovasi(data.kriteria_inovasi).map((k: string, i: number) => (
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
                {(Array.isArray(data.pic_penanggung_jawab) && data.pic_penanggung_jawab.length
                  ? data.pic_penanggung_jawab
                  : [{ nama: data.pic_nama, no_whatsapp: data.pic_telp }]
                ).map((contact: any, index: number) => (
                  <div key={`${contact.nama}-${index}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    {index > 0 && <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Penanggung Jawab {index + 1}</p>}
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><i className="fa-solid fa-user text-sm"></i></div>
                      <div className="min-w-0"><p className="text-[10px] text-gray-500 uppercase font-bold">Nama Lengkap</p><p className="text-sm font-bold text-gray-900 truncate">{contact.nama || '-'}</p></div>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><i className="fa-brands fa-whatsapp text-sm"></i></div>
                      <div className="min-w-0"><p className="text-[10px] text-gray-500 uppercase font-bold">No. Telepon / WA</p><p className="text-sm font-bold text-gray-900 truncate">{contact.no_whatsapp || '-'}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100">
              <h3 className="mb-4 text-sm font-bold text-gray-800">Asal Instansi</h3>
              <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3 border border-gray-100">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                  <i className="fa-regular fa-building text-sm"></i>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-gray-500 uppercase font-bold">Unit</p>
                  <p className="text-sm font-bold text-gray-900 truncate">{data.satker?.nama_satker || '-'}</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* KOLOM KANAN (Form Assessment & Aksi) */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-gray-100 pb-4">
              <h3 className="text-lg font-bold text-gray-800">{getReviewerStageName(tahap)}</h3>
              <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                Total {data.assessment_answers?.length || 0} Pertanyaan
              </span>
            </div>

            {tahap === 2 && <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-6 text-indigo-800">
              Pertanyaan dan jawaban dari hasil Seleksi Awal dibawa otomatis ke penilaian ini. Pertanyaan tambahan Penilaian Akhir ditampilkan setelahnya.
              {data.requires_assessment_save && <span className="mt-1 block font-medium">Klik Edit Assessment, lengkapi penilaian, lalu simpan sebelum menandatangani.</span>}
            </div>}
            <div className="space-y-4">
              {data.assessment_answers && data.assessment_answers.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                  <BAAnswerGrid questionTitle={questionTitle} answers={data.assessment_answers} columns={columns} values={localAnswers} disabled={!isEditing} onChange={(answerId, value) => { setLocalAnswers((prev) => ({ ...prev, [answerId]: value })); setChanged(true) }} />
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
                onClick={() => {
                  if (!data.assigned_users?.length) { notify('Belum ada tim penilai yang ditugaskan untuk inovasi ini.', 'warning'); return }
                  if (!data.assigned_users.some((u: any) => String(u.id) === String(currentUser?.id))) { notify('Akun Anda belum ditugaskan sebagai penilai untuk inovasi ini.', 'warning'); return }
                  if (data.signatures?.length > 0) { notify('Assessment tidak dapat diedit setelah ada tanda tangan.', 'warning'); return }
                  setIsEditing(true)
                }}
                disabled={saving}
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
                  disabled={saving || (tahap === 1 && !changed) || !data.assessment_answers?.length}
                  className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-200 transition-all"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
                </button>
              </>
            )}

            <div className="hidden sm:block w-px h-8 bg-gray-200 mx-1"></div>

            {tahap === 1 && <button
              onClick={() => {
                if (!data.assigned_users?.length) { notify('Belum ada tim penilai yang ditugaskan untuk inovasi ini.', 'warning'); return }
                setPerbaikanModal(true)
              }}
              disabled={saving || isEditing}
              className="rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-amber-200 transition-all"
            >
              Kembalikan (Perbaikan)
            </button>}
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
                      <p className="font-medium text-sm text-gray-700">{signature.jabatan || signature.role || user.role}</p>

                      <img
                        src={signature.signature_data || signature.ttd_image}
                        className="h-28 w-auto object-contain my-2"
                        alt="Tanda Tangan"
                      />

                      <p className="font-bold text-sm text-gray-900 underline decoration-1 underline-offset-4">
                        {namaTampil}{signature.gelar ? ` ${signature.gelar}` : ''}
                      </p>
                      <p className="text-xs text-gray-800">NIP {nipTampil}</p>
                      {signature.keputusan && <p className="text-sm font-semibold">{signature.keputusan === 'LOLOS' ? 'Lolos' : 'Tidak Lolos'}</p>}
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

        {tahap === 2 && data.signatures?.filter((signature: any) => !data.assigned_users?.some((reviewer: any) => String(reviewer.id) === String(signature.user_id))).map((signature: any) => <div key={signature.id} className="mt-4 rounded-xl border border-slate-200 p-4"><p className="text-sm font-semibold">{signature.jabatan}</p><img src={signature.ttd_image} alt="Tanda tangan satker" className="h-20 max-w-48 object-contain" /><p className="text-sm">{signature.nama}</p><p className="text-xs text-slate-500">NIP {signature.nip}</p></div>)}
        {/* Form Tambah Tanda Tangan (HANYA jika user login adalah penilai assigned && belum sign) */}
        {data.assigned_users?.some(
          (u: any) =>
            String(u.id || u.user_id) === String(currentUser?.id)
        ) && !data.signatures?.some(
          (s: any) => String(s.user_id) === String(currentUser?.id)
        ) && (
          tahap === 2 ? <div className="mt-6 border-t border-gray-100 pt-6"><FinalSignatureForm id={id!} satker={data.satker} disabled={isEditing || changed || data.requires_assessment_save} onSigned={async () => { const res = await getUsulanDetail(id!, 2); const detail = res.data?.data ?? res.data; setData(detail); initLocalAnswers(detail.assessment_answers ?? []); onUpdated?.() }} /></div> : <div className="mt-6 border-t border-gray-100 pt-6">
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m4 20 4.5-1 9.8-9.8a2.1 2.1 0 0 0-3-3L5.5 16 4 20Zm9.8-12.8 3 3M13 20h7" /></svg>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-800">Form tanda tangan</h4>
                <p className="mt-1 text-xs leading-5 text-gray-500">Lengkapi identitas dan bubuhkan tanda tangan pada area di bawah.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="block min-w-0 text-sm font-medium text-gray-700">
                Penanda tangan
                <input readOnly value={currentUser?.nama_lengkap || ''} className="mt-1.5 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 text-sm font-normal text-gray-600 outline-none" />
              </label>
              <label className="block min-w-0 text-sm font-medium text-gray-700">
                Sebagai / Peran <span className="text-rose-500">*</span>
                <input
                  type="text"
                  aria-label="Sebagai / Peran penanda tangan"
                  placeholder="Contoh: SKI atau Timker Manajemen Risiko"
                  value={jabatanTtd}
                  onChange={e => setJabatanTtd(e.target.value)}
                  maxLength={120}
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-normal text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                />
              </label>
              <label className="block min-w-0 text-sm font-medium text-gray-700">
                NIP <span className="text-rose-500">*</span>
                <input
                  type="text"
                  aria-label="NIP penanda tangan"
                  placeholder="Masukkan NIP"
                  value={nipTtd}
                  onChange={e => setNipTtd(e.target.value.replace(/\D/g, ''))}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={30}
                  required
                  className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-normal text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                />
              </label>
            </div>

            <label className="mt-4 block max-w-xl text-sm font-medium text-gray-700">
              Keputusan penilaian <span className="text-rose-500">*</span>
              <select value={keputusan} onChange={(e) => setKeputusan(e.target.value as 'LOLOS' | 'TIDAK_LOLOS' | '')} className="mt-1.5 block h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-normal text-gray-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50">
                <option value="">Pilih keputusan</option>
                <option value="LOLOS">Lolos</option>
                <option value="TIDAK_LOLOS">Tidak Lolos</option>
              </select>
              <span className="mt-1.5 block text-xs leading-5 font-normal text-gray-500">Pilih Lolos atau Tidak Lolos. Hasil akhir mengikuti suara mayoritas setelah semua penilai menandatangani; jika suara seri, hasilnya Tidak Lolos.</span>
            </label>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3">
                <span className="text-sm font-medium text-gray-700">Tanda tangan</span>
                <span className="text-xs text-gray-500">Gunakan mouse, touchpad, atau layar sentuh</span>
              </div>
              <SignatureCanvas
                ref={sigPad}
                penColor="#111827"
                canvasProps={{ className: 'block h-44 w-full cursor-crosshair touch-none' }}
              />
            </div>

            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => sigPad.current?.clear()}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-gray-100"
              >
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6m4-6v6M5 7l1 13h12l1-13M9 7V4h6v3" /></svg>
                Hapus tanda tangan
              </button>
              <button
                type="button"
                onClick={handleSimpanTandaTangan}
                disabled={signing || isEditing || changed || data.requires_assessment_save || !nipTtd.trim() || !jabatanTtd.trim() || !keputusan}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-blue-300 sm:min-w-48"
              >
                {signing ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" /></svg>}
                {signing ? 'Menyimpan...' : 'Simpan tanda tangan'}
              </button>
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
                placeholder="Jelaskan secara detail bagian mana yang perlu diperbaiki oleh Unit..."
                className="w-full rounded-xl border border-gray-300 p-3.5 text-sm focus:border-amber-500 focus:ring-1 focus:ring-amber-500 resize-none transition-all"
              ></textarea>
              <p className="text-xs text-gray-500 mt-2">Catatan ini akan dikirimkan langsung ke dashboard Unit.</p>
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
                {submittingPerbaikan ? 'Mengirim...' : 'Kirim ke Unit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
