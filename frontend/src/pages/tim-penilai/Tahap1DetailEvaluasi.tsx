import FinalSignatureForm from '../../components/FinalSignatureForm';
import BAAnswerGrid from './BAAnswerGrid';
import { getBAColumns } from '../../services/inovasi.service';
import type { BAColumn } from '../../services/inovasi.service';
import { useCallback, useEffect, useState, useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  getUsulanDetail,
  savePenilaianCells,
  type AssessmentCellChange,
  downloadHasilEvaluasiPdf,
  kembalikanUsulan,
  simpanTandaTangan
} from '../../services/inovasi.service';
import { getStatusPresentation } from '../../utils/inovasi-status';
import { useNotifications } from '../../components/NotificationProvider';
import { formatJenisInovasi } from '../../utils/jenis-inovasi';
import { normalizeKriteriaInovasi } from '../../utils/kriteria-inovasi';
import { getReviewerStageName } from '../../utils/tahap-reviewer';
import RevisionHistory from '../../components/RevisionHistory';

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

interface PendingAssessmentCell extends AssessmentCellChange {
  revision: number
}

function getPendingAssessmentStorageKey(id?: string, tahap?: number, userId?: string | number | null) {
  if (!id || userId === undefined || userId === null || userId === '') return null;
  return `siapin:pending-assessment:v1:${userId}:${tahap ?? 1}:${id}`;
}

const TAHAP_AWAL_SIGNER_ROLES = [
  'SKI',
  'Timker Manajemen Risiko, Reformasi Birokrasi dan Monev',
];

function localAnswerValue(answer: any) {
  return {
    jawaban_boolean: answer.jawaban_boolean ?? false,
    catatan_string: answer.catatan_string || '',
    link: answer.link || '',
    custom_values: answer.custom_values || {},
  }
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
  const [autosaveStatus, setAutosaveStatus] = useState<'saved' | 'pending' | 'saving' | 'error'>('saved');
  const [isEditing, setIsEditing] = useState(false);
  const pendingCellsRef = useRef(new Map<string, PendingAssessmentCell>());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savePromiseRef = useRef<Promise<void> | null>(null);
  const saveSequenceRef = useRef(0);
  const retryAttemptRef = useRef(0);
  const autosaveErrorNotifiedRef = useRef(false);
  const flushCellsRef = useRef<() => Promise<void>>(async () => undefined);

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

  const pendingStorageKey = getPendingAssessmentStorageKey(id, tahap, currentUser?.id ?? getUser()?.id);
  const persistPendingCells = useCallback(() => {
    if (!pendingStorageKey) return;
    try {
      const cells = [...pendingCellsRef.current.entries()].map(([key, cell]) => ({ key, ...cell }));
      if (cells.length) sessionStorage.setItem(pendingStorageKey, JSON.stringify(cells));
      else sessionStorage.removeItem(pendingStorageKey);
    } catch {
      // Keep editing even when browser storage is unavailable; the server autosave still runs.
    }
  }, [pendingStorageKey]);

  const initLocalAnswers = (assessmentAnswers: any[]) => {
    const init: Record<string, any> = {};
    assessmentAnswers.forEach((ans: any) => {
      init[String(ans.question_id)] = localAnswerValue(ans);
    });
    pendingCellsRef.current.clear();
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    setLocalAnswers(init);
    setChanged(false);
    setAutosaveStatus('saved');
  };

  const restorePendingCells = (assessmentAnswers: any[]) => {
    if (!pendingStorageKey) return;
    try {
      const serialized = sessionStorage.getItem(pendingStorageKey);
      if (!serialized) return;
      const restored = JSON.parse(serialized);
      if (!Array.isArray(restored)) throw new Error('Invalid pending assessment data');

      const answersByQuestion = new Map<string, any>();
      assessmentAnswers.forEach((answer: any) => answersByQuestion.set(String(answer.question_id), localAnswerValue(answer)));
      const pending = new Map<string, PendingAssessmentCell>();
      for (const cell of restored) {
        if (!Number.isInteger(cell?.question_id) || cell.question_id <= 0 || typeof cell?.column_key !== 'string') continue;
        if (!['string', 'number', 'boolean'].includes(typeof cell.value)) continue;
        const key = `${cell.question_id}:${cell.column_key}`;
        const revision = Number.isInteger(cell.revision) ? cell.revision : ++saveSequenceRef.current;
        pending.set(key, { question_id: cell.question_id, column_key: cell.column_key, value: cell.value, revision });
        saveSequenceRef.current = Math.max(saveSequenceRef.current, revision);
      }

      for (const cell of pending.values()) {
        const answer = answersByQuestion.get(String(cell.question_id));
        if (!answer) continue;
        answer.custom_values = { ...answer.custom_values, [cell.column_key]: cell.value };
        if (cell.column_key === 'jawaban_boolean') answer.jawaban_boolean = cell.value;
        if (cell.column_key === 'catatan_string') answer.catatan_string = cell.value;
        if (cell.column_key === 'link') answer.link = cell.value;
      }

      pendingCellsRef.current = pending;
      setLocalAnswers(Object.fromEntries(answersByQuestion));
      setChanged(pending.size > 0);
      setAutosaveStatus(pending.size > 0 ? 'pending' : 'saved');
      if (pending.size > 0) {
        saveTimerRef.current = setTimeout(() => { void flushCellsRef.current(); }, 250);
      } else {
        sessionStorage.removeItem(pendingStorageKey);
      }
    } catch {
      try { sessionStorage.removeItem(pendingStorageKey); } catch { /* storage may be unavailable */ }
    }
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
        if (detail?.assessment_answers) {
          initLocalAnswers(detail.assessment_answers);
          restorePendingCells(detail.assessment_answers);
        }
      })
      .catch(() => notify('Gagal memuat detail usulan.', 'error'))
      .finally(() => setLoading(false));
  }, [id, tahap]);

  const flushPendingCellSaves = useCallback((): Promise<void> => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (savePromiseRef.current) return savePromiseRef.current;
    const pendingSnapshot = [...pendingCellsRef.current.entries()];
    if (!id || pendingSnapshot.length === 0) {
      setAutosaveStatus('saved');
      setChanged(false);
      return Promise.resolve();
    }

    setSaving(true);
    setAutosaveStatus('saving');
    const request = (async () => {
      let failed = false;
      let shouldRetry = false;
      try {
        const response = await savePenilaianCells(id, pendingSnapshot.map(([, cell]) => ({
          question_id: cell.question_id,
          column_key: cell.column_key,
          value: cell.value,
        })), tahap);
        if (Number(response.data?.invalidated_signatures ?? 0) > 0) {
          setData((current: any) => current ? {
            ...current,
            signatures: [],
            usulan_signatures: [],
            status: 'PENDING',
            ...(tahap === 2 ? { status_tahap2: 'PENDING' } : {}),
          } : current);
          onUpdated?.();
          notify('Perubahan tersimpan. Tanda tangan tahap ini dibatalkan; tim reviewer perlu menandatangani ulang.', 'warning');
        }
        for (const [key, savedCell] of pendingSnapshot) {
          if (pendingCellsRef.current.get(key)?.revision === savedCell.revision) pendingCellsRef.current.delete(key);
        }
        persistPendingCells();
        if (pendingCellsRef.current.size === 0) {
          setChanged(false);
          setAutosaveStatus('saved');
        } else {
          setAutosaveStatus('pending');
        }
        retryAttemptRef.current = 0;
        autosaveErrorNotifiedRef.current = false;
      } catch (err: unknown) {
        failed = true;
        setAutosaveStatus('error');
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        shouldRetry = status === undefined || status === 408 || status === 429 || status >= 500;
        if (!autosaveErrorNotifiedRef.current) {
          notify(axios.isAxiosError(err) ? err.response?.data?.message || 'Autosave gagal. Perubahan masih tersimpan sementara di tab dan akan dicoba ulang.' : 'Autosave gagal. Perubahan masih tersimpan sementara di tab dan akan dicoba ulang.', 'error');
          autosaveErrorNotifiedRef.current = true;
        }
      } finally {
        savePromiseRef.current = null;
        setSaving(false);
        if (pendingCellsRef.current.size > 0 && !failed) {
          saveTimerRef.current = setTimeout(() => { void flushCellsRef.current(); }, 180);
        } else if (pendingCellsRef.current.size > 0 && shouldRetry) {
          const delay = Math.min(1000 * (2 ** retryAttemptRef.current), 15000);
          retryAttemptRef.current = Math.min(retryAttemptRef.current + 1, 4);
          saveTimerRef.current = setTimeout(() => { void flushCellsRef.current(); }, delay);
        }
      }
    })();
    savePromiseRef.current = request;
    return request;
  }, [id, tahap, notify, persistPendingCells, onUpdated]);

  flushCellsRef.current = flushPendingCellSaves;

  const scheduleCellSave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setAutosaveStatus('pending');
    saveTimerRef.current = setTimeout(() => { void flushCellsRef.current(); }, 650);
  };

  const handleReviewerCellChange = (answerId: string, value: any, columnKey?: string, questionId?: number) => {
    const stableQuestionId = questionId ?? Number(data?.assessment_answers?.find((answer: any) => String(answer.id) === answerId)?.question_id);
    const answerKey = Number.isInteger(stableQuestionId) && stableQuestionId > 0 ? String(stableQuestionId) : answerId;
    setLocalAnswers((previous) => ({ ...previous, [answerKey]: value }));
    if (!columnKey || !Number.isInteger(stableQuestionId) || stableQuestionId <= 0) return;

    const cellValue = value.custom_values?.[columnKey]
      ?? (columnKey === 'jawaban_boolean' ? value.jawaban_boolean
        : columnKey === 'catatan_string' ? value.catatan_string
          : columnKey === 'link' ? value.link
            : undefined);
    if (cellValue === undefined || cellValue === null) return;
    const key = `${stableQuestionId}:${columnKey}`;
    pendingCellsRef.current.set(key, {
      question_id: stableQuestionId,
      column_key: columnKey,
      value: cellValue,
      revision: ++saveSequenceRef.current,
    });
    persistPendingCells();
    setChanged(true);
    scheduleCellSave();
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const refreshCollaborativeAnswers = async () => {
      try {
        const response = await getUsulanDetail(id, tahap);
        if (cancelled) return;
        const refreshed = response.data?.data || response.data;
        const remoteAnswers = refreshed.assessment_answers ?? [];
        setData(refreshed);
        setLocalAnswers((previous) => {
          const next = { ...previous };
          for (const answer of remoteAnswers) {
            const questionId = String(answer.question_id);
            const row = localAnswerValue(answer);
            for (const pending of pendingCellsRef.current.values()) {
              if (String(pending.question_id) !== questionId) continue;
              row.custom_values = { ...row.custom_values, [pending.column_key]: pending.value };
              if (pending.column_key === 'jawaban_boolean') row.jawaban_boolean = pending.value;
              if (pending.column_key === 'catatan_string') row.catatan_string = pending.value;
              if (pending.column_key === 'link') row.link = pending.value;
            }
            next[questionId] = row;
          }
          return next;
        });
      } catch {
        // Keep the current worksheet usable when a background refresh is temporarily unavailable.
      }
    };
    const interval = setInterval(() => { void refreshCollaborativeAnswers(); }, 1800);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [id, tahap]);

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
  }, [id, tahap]);

  useEffect(() => {
    const user = getUser();
    setCurrentUser(user);
  }, []);

  const handleSimpan = async () => {
    await flushPendingCellSaves();
    if (pendingCellsRef.current.size > 0) return;
    setIsEditing(false);
    notify('Semua perubahan sudah tersimpan otomatis.', 'success');
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
      navigate(`/tim-penilai/penilaian/${id}`);
    } catch (err: unknown) {
      const apiMessage = axios.isAxiosError(err) ? err.response?.data?.message : null;
      const message = Array.isArray(apiMessage)
        ? apiMessage.join(' ')
        : typeof apiMessage === 'string'
          ? apiMessage
          : 'Gagal mengembalikan usulan. Periksa koneksi backend lalu coba lagi.';
      notify(message, 'error');
    } finally {
      setSubmittingPerbaikan(false);
      setPerbaikanModal(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px] text-gray-500 font-medium">Memuat detail inovasi...</div>;
  if (!data) return <div className="flex items-center justify-center min-h-[400px] text-rose-500 font-medium">Data tidak ditemukan.</div>;
  const waitingForSatker = data.status === 'PERBAIKAN';

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
            onClick={() => navigate(`/tim-penilai/penilaian/${id}`)}
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

      {waitingForSatker && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">Menunggu perbaikan dari Satker</p>
        <p className="mt-1">Penilaian dan tanda tangan reviewer tidak dapat diubah sampai Satker mengirimkan kembali usulan.</p>
      </div>}
      <RevisionHistory logs={data.revision_logs ?? []} fallbackNote={waitingForSatker ? data.catatan_perbaikan : null} />

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
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Deskripsi Singkat Inovasi</p>
              <p className="whitespace-pre-wrap text-sm font-medium text-gray-900">{data.deskripsi_inovasi || '-'}</p>
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
              <div>
                <h3 className="text-lg font-bold text-gray-800">{getReviewerStageName(tahap)}</h3>
                <span role="status" aria-live="polite" className={`mt-1 inline-block text-xs ${autosaveStatus === 'error' ? 'font-semibold text-rose-600' : autosaveStatus === 'saving' || autosaveStatus === 'pending' ? 'text-amber-700' : 'text-emerald-700'}`}>
                  {autosaveStatus === 'saving' ? 'Menyimpan perubahan…' : autosaveStatus === 'pending' ? 'Perubahan akan disimpan…' : autosaveStatus === 'error' ? 'Gagal menyimpan. Perubahan tersimpan sementara di tab; klik Simpan Ulang.' : 'Tersimpan otomatis · perubahan reviewer disinkronkan'}
                </span>
              </div>
              <span className="text-xs font-semibold text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
                Total {data.assessment_answers?.length || 0} Pertanyaan
              </span>
            </div>

            {tahap === 2 && <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-6 text-indigo-800">
              Pertanyaan dan jawaban dari hasil Seleksi Awal dibawa otomatis ke penilaian ini. Pertanyaan tambahan Penilaian Akhir ditampilkan setelahnya.
              {data.requires_assessment_save && <span className="mt-1 block font-medium">Isi kolom akan tersimpan otomatis. Tanda tangan aktif setelah semua jawaban tersimpan.</span>}
            </div>}
            <div className="space-y-4">
              {data.assessment_answers && data.assessment_answers.length > 0 ? (
                <div className="w-full">
                  <BAAnswerGrid questionTitle={questionTitle} answers={data.assessment_answers} columns={columns} values={localAnswers} disabled={!isEditing} onChange={handleReviewerCellChange} />
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
            {waitingForSatker ? <span className="mr-auto text-sm font-medium text-amber-800">Perubahan terkunci sampai Satker mengirim ulang.</span> : <>
            {!isEditing ? (
              <button
                onClick={() => {
                  if (!data.assigned_users?.length) { notify('Belum ada tim penilai yang ditugaskan untuk inovasi ini.', 'warning'); return }
                  if (!data.assigned_users.some((u: any) => String(u.id) === String(currentUser?.id))) { notify('Akun Anda belum ditugaskan sebagai penilai untuk inovasi ini.', 'warning'); return }
                  if (data.signatures?.length > 0) notify('BA tetap dapat diedit. Tanda tangan tahap ini akan dibatalkan dan tim reviewer perlu menandatangani ulang.', 'warning')
                  setIsEditing(true)
                }}
                disabled={saving}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:text-gray-900 transition-colors"
              >
                Edit Assessment
              </button>
            ) : (
              <button
                onClick={handleSimpan}
                disabled={saving || !data.assessment_answers?.length}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-blue-200 transition-all"
              >
                {saving ? 'Menyimpan...' : autosaveStatus === 'error' ? 'Simpan Ulang' : 'Selesai Edit'}
              </button>
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
            </>}
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
        ) && !waitingForSatker && (
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
                {tahap === 1 ? (
                  <select
                    aria-label="Sebagai / Peran penanda tangan"
                    value={jabatanTtd}
                    onChange={e => setJabatanTtd(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-normal text-gray-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  >
                    <option value="">Pilih peran</option>
                    {TAHAP_AWAL_SIGNER_ROLES.map(role => <option key={role} value={role}>{role}</option>)}
                  </select>
                ) : (
                  <input
                    type="text"
                    aria-label="Sebagai / Peran penanda tangan"
                    placeholder="Masukkan peran penanda tangan"
                    value={jabatanTtd}
                    onChange={e => setJabatanTtd(e.target.value)}
                    maxLength={120}
                    className="mt-1.5 h-11 w-full rounded-xl border border-gray-300 bg-white px-3.5 text-sm font-normal text-gray-800 outline-none transition placeholder:text-gray-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-50"
                  />
                )}
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
                penColor="#393231"
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
