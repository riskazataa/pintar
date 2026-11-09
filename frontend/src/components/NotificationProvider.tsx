import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export type NotificationKind = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: number
  message: string
  kind: NotificationKind
  title: string
}

interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

interface ConfirmDialog extends ConfirmOptions {
  message: string
  resolve: (accepted: boolean) => void
}

interface NotificationContextValue {
  notify: (message: string, kind?: NotificationKind, title?: string) => void
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>
}

const NotificationContext = createContext<NotificationContextValue | null>(null)

const titles: Record<NotificationKind, string> = {
  success: 'Berhasil',
  error: 'Terjadi kesalahan',
  warning: 'Perhatian',
  info: 'Informasi',
}

function NoticeIcon({ kind }: { kind: NotificationKind }) {
  if (kind === 'success') return <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
  if (kind === 'error') return <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6 6 18" />
  if (kind === 'warning') return <><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.9 2.6 17.2A1.8 1.8 0 0 0 4.2 20h15.6a1.8 1.8 0 0 0 1.6-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" /></>
  return <><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M12 11v5m0-8h.01" /></>
}

const toastStyles: Record<NotificationKind, { icon: string; border: string; title: string }> = {
  success: { icon: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100', title: 'text-emerald-900' },
  error: { icon: 'bg-rose-50 text-rose-600', border: 'border-rose-100', title: 'text-rose-900' },
  warning: { icon: 'bg-amber-50 text-amber-600', border: 'border-amber-100', title: 'text-amber-900' },
  info: { icon: 'bg-blue-50 text-blue-600', border: 'border-blue-100', title: 'text-blue-900' },
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const [dialog, setDialog] = useState<ConfirmDialog | null>(null)
  const dialogRef = useRef<ConfirmDialog | null>(null)
  const timers = useRef(new Map<number, number>())
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(id)
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const notify = useCallback((message: string, kind: NotificationKind = 'info', title?: string) => {
    const id = ++nextId.current
    setItems((current) => [...current.slice(-3), { id, message, kind, title: title || titles[kind] }])
    timers.current.set(id, window.setTimeout(() => dismiss(id), 4800))
  }, [dismiss])

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => new Promise<boolean>((resolve) => {
    dialogRef.current?.resolve(false)
    const nextDialog: ConfirmDialog = { message, resolve, ...options }
    dialogRef.current = nextDialog
    setDialog(nextDialog)
  }), [])

  const finishConfirm = (accepted: boolean) => {
    const current = dialogRef.current
    dialogRef.current = null
    setDialog(null)
    current?.resolve(accepted)
  }

  useEffect(() => () => {
    timers.current.forEach((timer) => window.clearTimeout(timer))
    dialogRef.current?.resolve(false)
  }, [])

  return (
    <NotificationContext.Provider value={{ notify, confirm }}>
      {children}

      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 sm:right-6 sm:top-6" aria-live="polite" aria-relevant="additions text">
        {items.map((item) => {
          const style = toastStyles[item.kind]
          return <div key={item.id} role={item.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto flex items-start gap-3 rounded-2xl border ${style.border} bg-white p-4 shadow-xl shadow-slate-900/10 animate-[notification-in_.22s_ease-out]`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.icon}`}><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><NoticeIcon kind={item.kind} /></svg></span>
            <div className="min-w-0 flex-1 pt-0.5"><p className={`text-sm font-semibold ${style.title}`}>{item.title}</p><p className="mt-0.5 break-words text-sm leading-5 text-slate-600">{item.message}</p></div>
            <button type="button" onClick={() => dismiss(item.id)} aria-label="Tutup notifikasi" className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" /></svg></button>
          </div>
        })}
      </div>

      {dialog && <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) finishConfirm(false) }}>
        <section role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message" className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-950/20">
          <button type="button" onClick={() => finishConfirm(false)} aria-label="Tutup konfirmasi" className="absolute right-3 top-3 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m6 6 12 12M18 6 6 18" /></svg></button>
          <div className="px-6 pb-5 pt-7 text-center">
            <div className={`mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${dialog.destructive ? 'bg-rose-50 text-rose-600' : 'bg-violet-50 text-violet-600'}`}><svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">{dialog.destructive ? <><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" /><path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.9 2.6 17.2A1.8 1.8 0 0 0 4.2 20h15.6a1.8 1.8 0 0 0 1.6-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" /></> : <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m6 2.25a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />}</svg></div>
            <h2 id="app-confirm-title" className="text-lg font-semibold text-slate-900">{dialog.title || 'Konfirmasi tindakan'}</h2>
            <p id="app-confirm-message" className="mt-2 text-sm leading-6 text-slate-600">{dialog.message}</p>
          </div>
          <div className="flex justify-center gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-3">
            <button type="button" onClick={() => finishConfirm(false)} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-100">{dialog.cancelLabel || 'Batal'}</button>
            <button type="button" autoFocus onClick={() => finishConfirm(true)} className={`h-10 rounded-xl px-4 text-sm font-semibold text-white transition ${dialog.destructive ? 'bg-rose-600 hover:bg-rose-700' : 'bg-violet-600 hover:bg-violet-700'}`}>{dialog.confirmLabel || 'Lanjutkan'}</button>
          </div>
        </section>
      </div>}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (!context) throw new Error('useNotifications harus dipakai di dalam NotificationProvider')
  return context
}
