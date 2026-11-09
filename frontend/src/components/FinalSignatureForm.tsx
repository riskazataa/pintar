import { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import axios from 'axios'
import { simpanTandaTangan } from '../services/inovasi.service'

const REVIEWER_ROLES = ['Dalnis Itjen', 'Ketua Tim Itjen', 'Anggota Tim Itjen', 'Biro Perencanaan', 'Ketua Tim Kerja Monev I Biro Perencanaan', 'Ketua Tim Kerja Marvel']

function getUnitRole(name: string) {
  if (/^biro perencanaan$/i.test(name.trim())) return 'Biro Perencanaan'
  if (/direktorat/i.test(name)) return 'Petugas Unit Eselon 1'
  return `Petugas BKK (${name})`
}

export default function FinalSignatureForm({ id, satker, unitMode = false, disabled = false, onSigned }: { id: string | number; satker?: { id?: number; nama_satker?: string }; unitMode?: boolean; disabled?: boolean; onSigned: () => void | Promise<void> }) {
  const [nama, setNama] = useState('')
  const [nip, setNip] = useState('')
  const [role, setRole] = useState('')
  const [decision, setDecision] = useState<'LOLOS' | 'TIDAK_LOLOS' | ''>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pad = useRef<SignatureCanvas>(null)
  const availableRoles = unitMode
    ? (satker?.nama_satker ? [getUnitRole(satker.nama_satker)] : [])
    : REVIEWER_ROLES
  const submit = async () => {
    if (!nama.trim() || !nip || !role || (!unitMode && !decision)) { setError('Lengkapi nama, NIP, peran, dan keputusan penilai.'); return }
    if (!/^\d+$/.test(nip)) { setError('NIP hanya boleh berisi angka.'); return }
    if (!pad.current || pad.current.isEmpty()) { setError('Bubuhkan tanda tangan terlebih dahulu.'); return }
    setBusy(true); setError('')
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}')
      await simpanTandaTangan(String(id), { usulan_inovasi_id: Number(id), user_id: Number(user.id), nama: nama.trim(), nip: nip.trim(), jabatan: role, signature_data: pad.current.getCanvas().toDataURL('image/png'), ...(unitMode ? {} : { keputusan: decision as 'LOLOS' | 'TIDAK_LOLOS' }) }, 2)
      await onSigned()
    } catch (err) { setError(axios.isAxiosError(err) ? err.response?.data?.message || 'Gagal menyimpan tanda tangan.' : 'Gagal menyimpan tanda tangan.') }
    finally { setBusy(false) }
  }
  const inputClass = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
  return <div className="space-y-4">
    <h3 className="font-semibold text-slate-900">Tanda Tangan Penilaian Akhir</h3>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
    {disabled && <p className="text-sm text-amber-700">Penilai perlu menyimpan seluruh jawaban penilaian akhir sebelum tanda tangan.</p>}
    <fieldset disabled={busy || disabled} className="space-y-4 disabled:opacity-60">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Nama lengkap dan gelar<input className={inputClass} value={nama} onChange={(e) => setNama(e.target.value)} maxLength={200} /></label>
        <label className="text-sm">NIP <span className="text-rose-500">*</span><input className={inputClass} value={nip} onChange={(e) => setNip(e.target.value.replace(/\D/g, ''))} inputMode="numeric" pattern="[0-9]*" maxLength={30} required /></label>
        <label className="text-sm sm:col-span-2">Peran<select className={inputClass} value={role} onChange={(e) => setRole(e.target.value)}><option value="">Pilih peran</option>{availableRoles.map((value) => <option key={value}>{value}</option>)}</select></label>
        {!unitMode && <label className="text-sm">Keputusan<select className={inputClass} value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}><option value="">Pilih keputusan</option><option value="LOLOS">Lolos</option><option value="TIDAK_LOLOS">Tidak Lolos</option></select></label>}
      </div>
      <div className="overflow-hidden rounded-lg border border-slate-300"><SignatureCanvas ref={pad} penColor="#393231" canvasProps={{ className: 'block h-44 w-full touch-none', 'aria-label': 'Tanda tangan penilaian akhir' }} /></div>
      <div className="flex justify-end gap-3"><button type="button" onClick={() => pad.current?.clear()} className="rounded-lg border px-4 py-2 text-sm">Hapus tanda tangan</button><button type="button" onClick={() => void submit()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm text-white">{busy ? 'Menyimpan...' : 'Simpan tanda tangan'}</button></div>
    </fieldset>
  </div>
}
