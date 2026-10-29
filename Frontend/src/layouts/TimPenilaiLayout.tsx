import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { logout } from '../services/auth.service'

const getUser = () => {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

interface MenuItem {
  to?: string
  label: string
  icon: string
  children?: { to: string; label: string }[]
}

const menuItems: MenuItem[] = [
  { to: '/tim-penilai/dashboard', label: 'Dashboard', icon: 'dashboard' },
  {
    label: 'Penilaian Tahap 1', icon: 'clipboard',
    children: [
      { to: '/tim-penilai/tahap-1/usulan', label: 'Usulan Inovasi' },
      { to: '/tim-penilai/tahap-1/evaluasi', label: 'Evaluasi' },
      { to: '/tim-penilai/tahap-1/hasil', label: 'Hasil' },
    ],
  },
  { to: '/tim-penilai/tahap-2', label: 'Penilaian Tahap 2', icon: 'chart' },
  { to: '/tim-penilai/management-ba', label: 'Management BA Inovasi', icon: 'folder' },
]

function MenuIcon({ name }: { name: string }) {
  const cls = 'w-5 h-5'
  switch (name) {
    case 'dashboard':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      )
    case 'clipboard':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      )
    case 'chart':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
        </svg>
      )
    case 'folder':
      return (
        <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
        </svg>
      )
    default:
      return null
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
      fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  )
}

export default function TimPenilaiLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [tahap1Open, setTahap1Open] = useState(true)
  const user = getUser()

  useEffect(() => {
    if (!user || user.role !== 'TIM_PENILAI_MARVEL') {
      navigate('/login', { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    const close = () => setProfileOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [])

  useEffect(() => {
    const tahap1Active = location.pathname.startsWith('/tim-penilai/tahap-1')
    if (tahap1Active) setTahap1Open(true)
  }, [location.pathname])

  if (!user || user.role !== 'TIM_PENILAI_MARVEL') return null

  return (
    <div className="flex h-screen bg-gray-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-white shadow-lg transition-transform duration-300 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center gap-2 border-b px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white">
            TP
          </div>
          <span className="text-lg font-semibold text-gray-800">Tim Penilai</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {menuItems.map((item) =>
            item.children ? (
              <div key={item.label}>
                <button
                  onClick={() => setTahap1Open((prev) => !prev)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
                >
                  <MenuIcon name={item.icon} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <Chevron open={tahap1Open} />
                </button>

                <div
                  className={`overflow-hidden transition-all duration-200 ${
                    tahap1Open ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="ml-3 space-y-0.5 border-l border-gray-200 pl-3 pt-0.5">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-violet-50 text-violet-700'
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                          }`
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to!}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-violet-50 text-violet-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`
                }
              >
                <MenuIcon name={item.icon} />
                {item.label}
              </NavLink>
            )
          )}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="hidden lg:block" />

          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setProfileOpen((prev) => !prev) }}
              className="flex items-center gap-2 rounded-full p-1 text-sm text-gray-600 hover:bg-gray-100"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                {user.nama_lengkap?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <span className="hidden text-gray-700 md:block">{user.nama_lengkap}</span>
              <svg className="hidden h-4 w-4 text-gray-400 md:block" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {profileOpen && (
              <div
                className="absolute right-0 z-50 mt-2 w-48 rounded-lg border bg-white py-1 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => { setProfileOpen(false) }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Profil
                </button>
                <hr className="my-1" />
                <button
                  onClick={() => { setProfileOpen(false); logout() }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
