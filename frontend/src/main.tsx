import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { NotificationProvider } from './components/NotificationProvider'

// Preserve existing sessions while moving accounts to the unified roles.
try {
  const savedUser = localStorage.getItem('user')
  if (savedUser) {
    const user = JSON.parse(savedUser)
    const legacyRoles: Record<string, string> = { SATKER: 'UNIT', TIM_PENILAI_MARVEL: 'REVIEWER', TIM_PENILAI_ITJEN: 'REVIEWER' }
    user.role = legacyRoles[user.role] ?? user.role
    localStorage.setItem('user', JSON.stringify(user))
  }
} catch { localStorage.removeItem('user') }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </BrowserRouter>
  </StrictMode>,
)
