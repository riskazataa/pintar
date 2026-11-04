import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Login from './login'
import Register from './register'

type Modal = 'login' | 'register' | null
function Icon({ kind = 'arrow', className = 'h-5 w-5' }: { kind?: string; className?: string }) {
  const paths: Record<string, string> = {
    arrow: 'M5 12h14m-6-6 6 6-6 6', check: 'm5 12 4 4L19 6',
    layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
    file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h5',
    chart: 'M4 19V5m0 14h16M8 15v-4m5 4V7m5 8v-6',
    pen: 'm15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15l-1 5h1Z',
    lock: 'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4',
    close: 'm6 6 12 12M6 18 18 6',
    phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.69 2.8a2 2 0 0 1-.45 2.11L8.08 9.92a16 16 0 0 0 6 6l1.29-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.8.69a2 2 0 0 1 1.72 2.03Z',
    message: 'M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z',
  }
  return <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind] || paths.arrow} /></svg>
}
const features = [
  { icon: 'file', title: 'Satu tempat untuk setiap usulan', text: 'Lengkapi data inovasi, tautan bukti pendukung, dan Self Assessment dalam satu pengajuan.', color: 'bg-blue-50 text-blue-600' },
  { icon: 'layers', title: 'Penilaian yang berkelanjutan', text: 'Tahap 2 membawa hasil Tahap 1. Tim penilai dapat melengkapi pertanyaan tambahan sesuai kebutuhan.', color: 'bg-violet-50 text-violet-600' },
  { icon: 'pen', title: 'Keputusan bersama, terdokumentasi', text: 'Penilai menandatangani dan memberikan keputusan. Hasil ditentukan dari suara mayoritas setelah seluruh penilai menandatangani.', color: 'bg-emerald-50 text-emerald-600' },
]
const steps = [
  ['01', 'Ajukan inovasi', 'Unit mengisi identitas inovasi, bukti pendukung, dan Self Assessment.'],
  ['02', 'Evaluasi Tahap 1', 'Tim penilai ditugaskan untuk meninjau isian dan memberikan penilaian.'],
  ['03', 'Lanjutkan Tahap 2', 'Penilaian berikutnya melanjutkan data Tahap 1 serta pertanyaan tambahan.'],
  ['04', 'Pantau & unduh hasil', 'Lihat status, progres tanda tangan, dan unduh berita acara PDF atau Excel.'],
]
const examples = [
  { title: 'Layanan antrean kesehatan digital', satker: 'Unit contoh A', stage: 'Penilaian Tahap 1', status: 'Sedang Direview', color: 'bg-amber-50 text-amber-700' },
  { title: 'Sistem monitoring kinerja terintegrasi', satker: 'Unit contoh B', stage: 'Penilaian Tahap 2', status: 'Menunggu Tanda Tangan', color: 'bg-blue-50 text-blue-700' },
  { title: 'Penyederhanaan layanan masyarakat', satker: 'Unit contoh C', stage: 'Penilaian selesai', status: 'Lolos', color: 'bg-emerald-50 text-emerald-700' },
]

export default function Landing({ initialModal = null }: { initialModal?: Modal }) {
  const [modal, setModal] = useState<Modal>(initialModal)
  const [registered, setRegistered] = useState(false)
  const [preview, setPreview] = useState('Semua')
  const [suggestion, setSuggestion] = useState('')
  const dialog = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useEffect(() => { setModal(initialModal) }, [initialModal])
  useEffect(() => {
    if (!modal) return
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const firstInput = dialog.current?.querySelector<HTMLInputElement>('input')
    firstInput?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setModal(null); return }
      if (event.key !== 'Tab') return
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]') || []).filter((el) => el.getClientRects().length > 0)
      const first = elements[0], last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); previous?.focus() }
  }, [modal])
  const close = () => { setModal(null); if (initialModal) navigate('/', { replace: true }) }
  const open = (mode: Modal) => { setRegistered(false); setModal(mode) }
  const primary = 'inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/15 transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600'

  return <div className="min-h-screen bg-[#fbfcfe] text-slate-900">
    <header className="border-b border-slate-100 bg-white/95">
      <nav aria-label="Navigasi utama" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-5 py-5 sm:px-8">
        <a href="/" aria-label="SIAPIN — beranda" className="flex items-center gap-3"><img src="/siapin-logo.svg" alt="" className="h-11 w-11 drop-shadow-sm" /><span className="text-xl font-extrabold tracking-tight text-slate-900">SIAPIN<span className="block text-[10px] font-medium uppercase tracking-[.13em] text-slate-500">Sistem Informasi Aplikasi Penetapan Inovasi</span></span></a>
        <div className="order-3 flex w-full justify-center gap-7 text-sm font-medium text-slate-500 md:order-none md:w-auto"><a className="hover:text-blue-600" href="#fitur">Fitur</a><a className="hover:text-blue-600" href="#alur">Cara kerja</a><a className="hover:text-blue-600" href="#faq">Tanya jawab</a><a className="hover:text-blue-600" href="#informasi">Informasi</a></div>
        <div className="flex items-center gap-4"><button onClick={() => open('register')} className="text-sm font-semibold text-slate-600 hover:text-blue-600">Daftar</button><button onClick={() => open('login')} className={primary}>Masuk <Icon className="h-4 w-4" /></button></div>
      </nav>
    </header>
    <main>
      <section className="relative overflow-hidden border-b border-slate-100">
        <div className="pointer-events-none absolute -right-32 top-0 h-[500px] w-[600px] rounded-full bg-blue-100/60 blur-[100px]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-2 lg:gap-16">
          <div><span className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700"><span className="h-1.5 w-1.5 rounded-full bg-blue-500" />Ruang kolaborasi inovasi</span>
            <h1 className="max-w-xl text-4xl font-bold leading-[1.13] tracking-tight sm:text-5xl lg:text-[56px]">Ide yang baik.<br />Proses yang jelas.<br /><span className="text-blue-600">Inovasi yang berarti.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-500">Kelola usulan, evaluasi, dan berita acara inovasi dalam satu ruang kerja. Dari Self Assessment hingga keputusan akhir, setiap tahap mudah diikuti.</p>
            <div className="mt-8 flex flex-wrap items-center gap-5"><button onClick={() => open('login')} className={primary}>Masuk ke ruang kerja <Icon className="h-4 w-4" /></button><a href="#alur" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600">Pelajari alurnya <Icon className="h-4 w-4" /></a></div>
            <div className="mt-8 flex flex-wrap gap-4 text-xs text-slate-500">{['Penilaian bertahap', 'Tanda tangan digital', 'Hasil PDF & Excel'].map((s) => <span key={s} className="flex items-center gap-1.5"><Icon kind="check" className="h-4 w-4 text-emerald-600" />{s}</span>)}</div>
          </div>
          <div className="rounded-[28px] border border-blue-200/70 bg-gradient-to-br from-blue-600 via-blue-500 to-indigo-500 p-4 shadow-2xl shadow-blue-900/10 sm:p-7">
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-300" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-300" /></div><span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Pratinjau · data contoh</span></div>
              <div className="p-5 sm:p-6"><p className="text-xs text-slate-400">Ruang kerja / Penilaian inovasi</p><div className="mt-4 flex items-center justify-between"><h2 className="text-lg font-bold">Usulan inovasi</h2><span className="rounded-lg bg-blue-50 p-2 text-blue-600"><Icon kind="chart" className="h-4 w-4" /></span></div>
                <div className="mt-5 flex gap-1 rounded-lg bg-slate-50 p-1">{['Semua', 'Dalam proses', 'Selesai'].map((tab) => <button key={tab} onClick={() => setPreview(tab)} className={`flex-1 rounded-md px-2 py-2 text-[11px] font-semibold transition ${preview === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}>{tab}</button>)}</div>
                <div className="mt-2 divide-y divide-slate-100">{examples.filter((item) => preview === 'Semua' || (preview === 'Selesai' ? item.status === 'Lolos' : item.status !== 'Lolos')).map((item) => <div key={item.title} className="py-4"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold leading-5">{item.title}</p><span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-semibold ${item.color}`}>{item.status === 'Menunggu Tanda Tangan' ? 'Menunggu TTD' : item.status}</span></div><p className="mt-1 text-[10px] text-slate-400">{item.satker} · {item.stage}</p></div>)}</div>
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-[10px] font-medium text-emerald-700"><Icon kind="check" className="h-4 w-4" />Satu inovasi, seluruh tahapan dalam satu tempat.</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="fitur" className="mx-auto max-w-7xl scroll-mt-8 px-5 py-20 sm:px-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Dirancang untuk berkolaborasi</p><h2 className="mt-3 text-3xl font-bold tracking-tight">Lebih teratur di setiap langkah.</h2><p className="mt-3 max-w-xl leading-7 text-slate-500">Unit dan reviewer bekerja dengan informasi yang saling terhubung, dalam alur yang mudah dipantau.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">{features.map((feature) => <article key={feature.title} className="rounded-2xl border border-slate-200/80 bg-white p-7"><span className={`inline-flex rounded-xl p-3 ${feature.color}`}><Icon kind={feature.icon} /></span><h3 className="mt-5 text-lg font-semibold leading-6">{feature.title}</h3><p className="mt-3 text-sm leading-7 text-slate-500">{feature.text}</p></article>)}</div>
      </section>
      <section id="alur" className="scroll-mt-8 border-y border-slate-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:gap-24">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">Cara kerja</p><h2 className="mt-3 text-3xl font-bold leading-tight tracking-tight">Dari pengajuan sampai hasil.<br />Semuanya terhubung.</h2><p className="mt-4 text-sm leading-7 text-slate-500">Buka satu inovasi untuk melihat isian, penugasan penilai, progres tanda tangan, dan hasil pada setiap tahap.</p><div className="mt-8 rounded-3xl bg-gradient-to-br from-violet-50 to-blue-50 p-6 sm:p-9"><div className="space-y-3">{['Self Assessment', 'Penilaian Tahap 1', 'Penilaian Tahap 2'].map((stage, i) => <div key={stage} className={`flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm ${i === 1 ? 'border-blue-300 ring-4 ring-blue-100/50' : 'border-white'}`}><span className={i === 1 ? 'text-blue-600' : 'text-emerald-600'}><Icon kind={i === 0 ? 'file' : 'layers'} /></span><span className="flex-1 text-sm font-semibold">{stage}</span>{i === 0 ? <Icon kind="check" className="h-4 w-4 text-emerald-600" /> : <span className={`h-2 w-2 rounded-full ${i === 1 ? 'bg-blue-500' : 'bg-slate-200'}`} />}</div>)}</div><p className="mt-4 text-center text-[11px] text-slate-400">Ilustrasi alur penilaian</p></div></div>
          <ol className="space-y-7">{steps.map(([number, title, text]) => <li key={number} className="flex gap-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-sm font-bold text-blue-600">{number}</span><div className="border-b border-slate-100 pb-6"><h3 className="text-base font-semibold">{title}</h3><p className="mt-2 text-sm leading-7 text-slate-500">{text}</p></div></li>)}</ol>
        </div>
      </section>
      <section id="faq" className="mx-auto max-w-3xl scroll-mt-8 px-5 py-20 sm:px-8"><p className="text-center text-xs font-bold uppercase tracking-[.18em] text-blue-600">Tanya jawab</p><h2 className="mt-3 text-center text-3xl font-bold tracking-tight">Sebelum mulai.</h2><div className="mt-8 divide-y divide-slate-200">{[
        ['Siapa yang dapat menggunakan aplikasi?', 'Aplikasi menyediakan ruang kerja untuk Unit, Reviewer, dan administrator sesuai akses masing-masing akun.'],
        ['Apakah data harus diisi ulang di Tahap 2?', 'Data dan hasil Tahap 1 dibawa ke Tahap 2. Pertanyaan tambahan dapat dilengkapi pada tahap berikutnya.'],
        ['Bagaimana hasil Lolos ditentukan?', 'Setiap penilai memberikan keputusan saat menandatangani. Setelah semua penilai menandatangani, suara mayoritas menentukan hasil. Jika suara seri, hasilnya Tidak Lolos.'],
        ['Di mana saya bisa mengunduh berita acara?', 'Unit dapat mengunduh PDF dan Excel bertanda tangan melalui Hasil Penilaian setelah penilaian selesai. Reviewer juga dapat mengunduhnya dari tahapan inovasi.'],
      ].map(([q, a]) => <details key={q} className="group py-5"><summary className="cursor-pointer text-sm font-semibold text-slate-800">{q}</summary><p className="mt-3 text-sm leading-7 text-slate-500">{a}</p></details>)}</div></section>
      <section id="informasi" className="border-y border-slate-100 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-blue-600">Kami siap membantu</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight">Informasi dan masukan</h2>
          <div className="mt-8 grid gap-5 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-6 sm:p-8">
              <span className="inline-flex rounded-xl bg-blue-50 p-3 text-blue-600"><Icon kind="phone" /></span>
              <h3 className="mt-5 text-lg font-semibold">Informasi Admin</h3>
              <p className="mt-4 text-sm text-slate-500">Nama</p>
              <p className="mt-1 font-semibold text-slate-800">Riska Zata Amani</p>
              <p className="mt-4 text-sm text-slate-500">WhatsApp</p>
              <a href="https://wa.me/6285285094427" target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 font-semibold text-blue-700 hover:text-blue-800">
                0852 8509 4427 <Icon kind="arrow" className="h-4 w-4" />
              </a>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-[#fbfcfe] p-6 sm:p-8">
              <span className="inline-flex rounded-xl bg-violet-50 p-3 text-violet-600"><Icon kind="message" /></span>
              <h3 className="mt-5 text-lg font-semibold">Pertanyaan atau Saran</h3>
              <p className="mt-2 text-sm leading-6 text-slate-500">Tuliskan masukan Anda. WhatsApp akan terbuka dengan pesan yang siap ditinjau dan dikirim.</p>
              <form className="mt-5" onSubmit={(event) => {
                event.preventDefault()
                const message = suggestion.trim()
                if (!message) return
                const url = `https://wa.me/6285285094427?text=${encodeURIComponent(`Pertanyaan atau saran SIAPIN:\n${message}`)}`
                window.open(url, '_blank', 'noopener,noreferrer')
              }}>
                <label htmlFor="landing-suggestion" className="sr-only">Pertanyaan atau saran</label>
                <textarea id="landing-suggestion" required rows={4} maxLength={1000} value={suggestion} onChange={(event) => setSuggestion(event.target.value)} placeholder="Tulis pertanyaan atau saran Anda di sini..." className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-4 focus:ring-blue-100" />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-slate-400">{suggestion.length}/1000 karakter</span>
                  <button type="submit" className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Kirim via WhatsApp <Icon className="h-4 w-4" /></button>
                </div>
              </form>
            </article>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8"><div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-slate-900 p-8 text-white sm:p-12 md:flex-row md:items-center"><div><h2 className="text-2xl font-semibold tracking-tight">Ruang untuk inovasi Anda berikutnya.</h2><p className="mt-3 text-sm text-slate-400">Mulai pengajuan dan ikuti perkembangannya dalam satu ruang kerja.</p></div><button onClick={() => open('register')} className="inline-flex shrink-0 items-center gap-3 rounded-full bg-white px-6 py-3 text-sm font-semibold text-slate-900 hover:bg-blue-50">Daftar sekarang <Icon className="h-4 w-4" /></button></div></section>
    </main>
      <footer className="border-t border-slate-100 px-5 py-7"><div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3 text-xs text-slate-400"><span className="font-semibold text-slate-600">SIAPIN · Sistem Informasi Aplikasi Penetapan Inovasi</span><span>Pengajuan, penilaian, dan dokumentasi inovasi.</span></div></footer>
    {modal && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-3 backdrop-blur-sm sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><div ref={dialog} role="dialog" aria-modal="true" aria-label={modal === 'login' ? 'Masuk ke ruang kerja' : 'Daftar akun'} className="relative my-auto flex max-h-[min(92dvh,820px)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><button onClick={close} aria-label="Tutup" className="absolute right-4 top-4 z-10 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Icon kind="close" /></button><div className="flex shrink-0 items-center justify-center gap-2 px-8 pt-5"><img src="/siapin-logo.svg" alt="" className="h-8 w-8" /><span className="text-lg font-extrabold tracking-tight text-blue-600">SIAPIN</span><span className="hidden text-xs font-medium text-slate-400 sm:inline">Sistem Informasi Aplikasi Penetapan Inovasi</span></div>{registered && <p role="status" className="mx-6 mt-3 shrink-0 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Pendaftaran berhasil. Silakan masuk setelah akun Anda disetujui oleh administrator.</p>}<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{modal === 'login' ? <Login onSwitch={() => open('register')} /> : <Register onSwitch={() => open('login')} onRegistered={() => { setRegistered(true); setModal('login') }} />}</div><div className="flex shrink-0 items-center justify-center gap-2 border-t border-slate-100 bg-slate-50 px-6 py-3 text-xs text-slate-400"><Icon kind="lock" className="h-3.5 w-3.5" />Akses sesuai peran akun Anda</div></div></div>}
  </div>
}
