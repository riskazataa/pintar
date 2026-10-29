import { Routes, Route, Navigate } from 'react-router-dom'

// Auth
import Login from './pages/login'
import Register from './pages/register'

// Shared Component (Dashboard)
import DashboardAnalytics from './pages/DashboardAnalytics'

// Admin
import AdminLayout from './layouts/AdminLayout'
import Akun from './pages/admin/Akun'
import Organisasi from './pages/admin/Organisasi'

// Satker
import SatkerLayout from './layouts/SatkerLayout'
import UsulanSatker from './pages/satker/Usulan'
import DetailUsulan from './pages/satker/DetailUsulan' // <--- 1. IMPORT HALAMAN DETAIL BARU
import HasilSatker from './pages/satker/Hasil'

// Tim Penilai Marvel
import TimPenilaiLayout from './layouts/TimPenilaiLayout'
import ManagementBA from './pages/tim-penilai/ManagementBA'
import Tahap1Usulan from './pages/tim-penilai/Tahap1Usulan'
import Tahap1Evaluasi from './pages/tim-penilai/Tahap1Evaluasi'
import Tahap1Hasil from './pages/tim-penilai/Tahap1Hasil'
import Tahap2 from './pages/tim-penilai/Tahap2'
import Tahap1DetailUsulan from './pages/tim-penilai/Tahap1DetailUsulan'
import Tahap1DetailEvaluasi from './pages/tim-penilai/Tahap1DetailEvaluasi'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Rute Super Admin */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardAnalytics />} />
        <Route path="akun" element={<Akun />} />
        <Route path="organisasi" element={<Organisasi />} />
      </Route>

      {/* Rute Satker */}
      <Route path="/satker" element={<SatkerLayout />}>
        <Route index element={<Navigate to="/satker/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardAnalytics />} />
        <Route path="usulan" element={<UsulanSatker />} />
        
        {/* 2. DAFTARKAN RUTE DETAIL DENGAN PARAMETER ID DI SINI */}
        <Route path="usulan/:id" element={<DetailUsulan />} />
        
        <Route path="hasil" element={<HasilSatker />} />
      </Route>

      {/* Rute Tim Penilai Marvel */}
      <Route path="/tim-penilai" element={<TimPenilaiLayout />}>
        <Route index element={<Navigate to="/tim-penilai/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardAnalytics />} />

        {/* Penilaian Tahap 1 (Nested Routes) */}
        <Route path="tahap-1/usulan" element={<Tahap1Usulan />} />
        <Route path="tahap-1/usulan/:id" element={<Tahap1DetailUsulan />} />
        <Route path="tahap-1/evaluasi" element={<Tahap1Evaluasi />} />
        <Route path="tahap-1/evaluasi/:id" element={<Tahap1DetailEvaluasi />} />
        <Route path="tahap-1/hasil" element={<Tahap1Hasil />} />

        {/* Penilaian Tahap 2 & Management BA */}
        <Route path="tahap-2" element={<Tahap2 />} />
        <Route path="management-ba" element={<ManagementBA />} />
      </Route>

      {/* Fallback */}
      <Route path="/" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App