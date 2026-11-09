import { Routes, Route, Navigate, useParams } from 'react-router-dom'

// Auth
import Landing from './pages/Landing'
import PasswordRecovery from './pages/PasswordRecovery'
import Profile from './pages/Profile'

// Shared Component (Dashboard)
import DashboardAnalytics from './pages/DashboardAnalytics'

// Admin
import AdminLayout from './layouts/AdminLayout'
import Akun from './pages/admin/Akun'
import Organisasi from './pages/admin/Organisasi'
import PengaturanUsulan from './pages/admin/PengaturanUsulan'

// Unit
import SatkerLayout from './layouts/SatkerLayout'
import UsulanSatker from './pages/satker/Usulan'
import DetailUsulan from './pages/satker/DetailUsulan' // <--- 1. IMPORT HALAMAN DETAIL BARU
import HasilSatker from './pages/satker/Hasil'

// Reviewer
import TimPenilaiLayout from './layouts/TimPenilaiLayout'
import ManagementBA from './pages/tim-penilai/ManagementBA'
import Tahap1Usulan from './pages/tim-penilai/Tahap1Usulan'
import InnovationWorkflow from './pages/tim-penilai/InnovationWorkflow'

function LegacyUsulanRedirect({ tahap }: { tahap?: number }) {
  const { id } = useParams()
  return <Navigate to={`/tim-penilai/usulan/${id}${tahap ? `/tahap-${tahap}` : ''}`} replace />
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Landing initialModal="login" />} />
      <Route path="/lupa-password" element={<PasswordRecovery key="request" mode="request" />} />
      <Route path="/reset-password" element={<PasswordRecovery key="reset" mode="reset" />} />
      <Route path="/register" element={<Landing initialModal="register" />} />
      <Route path="/profil" element={<Profile />} />

      {/* Rute Super Admin */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardAnalytics />} />
        <Route path="akun" element={<Akun />} />
        <Route path="organisasi" element={<Organisasi />} />
        <Route path="kunci-usulan" element={<PengaturanUsulan />} />
      <Route path="management-ba" element={<ManagementBA />} />
        <Route path="profil" element={<Profile />} />
      </Route>

      {/* Rute Unit */}
      <Route path="/satker" element={<SatkerLayout />}>
        <Route index element={<Navigate to="/satker/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardAnalytics />} />
        <Route path="usulan" element={<UsulanSatker />} />
        <Route path="usulan/tambah" element={<UsulanSatker />} />
        <Route path="usulan/:id/edit" element={<UsulanSatker />} />
        
        {/* 2. DAFTARKAN RUTE DETAIL DENGAN PARAMETER ID DI SINI */}
        <Route path="usulan/:id" element={<DetailUsulan />} />
        
        <Route path="hasil" element={<HasilSatker />} />
        <Route path="hasil/tahap-1" element={<Navigate to="/satker/hasil" replace />} />
        <Route path="hasil/tahap-2" element={<Navigate to="/satker/hasil" replace />} />
        <Route path="profil" element={<Profile />} />
      </Route>

      {/* Rute Reviewer */}
      <Route path="/tim-penilai" element={<TimPenilaiLayout />}>
        <Route index element={<Navigate to="/tim-penilai/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardAnalytics />} />
        <Route path="usulan" element={<Tahap1Usulan />} />
        <Route path="usulan/:id" element={<InnovationWorkflow />} />
        <Route path="usulan/:id/:section" element={<InnovationWorkflow />} />

        {/* Penilaian Tahap 1 (Nested Routes) */}
        <Route path="tahap-1/usulan" element={<Navigate to="/tim-penilai/usulan" replace />} />
        <Route path="tahap-1/usulan/:id" element={<LegacyUsulanRedirect />} />
        <Route path="tahap-1/evaluasi" element={<Navigate to="/tim-penilai/usulan" replace />} />
        <Route path="tahap-1/evaluasi/:id" element={<LegacyUsulanRedirect tahap={1} />} />
        <Route path="tahap-1/hasil" element={<Navigate to="/tim-penilai/usulan" replace />} />

        {/* Penilaian Tahap 2 */}
        <Route path="tahap-2" element={<Navigate to="/tim-penilai/usulan" replace />} />
        <Route path="tahap-2/evaluasi" element={<Navigate to="/tim-penilai/usulan" replace />} />
        <Route path="tahap-2/evaluasi/:id" element={<LegacyUsulanRedirect tahap={2} />} />
        <Route path="tahap-2/hasil" element={<Navigate to="/tim-penilai/usulan" replace />} />
        <Route path="profil" element={<Profile />} />
      </Route>

      {/* Fallback */}
      <Route path="/" element={<Landing />} />
    </Routes>
  )
}

export default App
