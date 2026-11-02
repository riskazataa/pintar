import api from '../api/axios'

export const verifyUser = (userId: string, status: 'APPROVED' | 'REJECTED') =>
  api.patch(`/admin/verify-user/${userId}`, { status })

export const getUsersByStatus = (status?: string) =>
  api.get('/admin/users', { params: { status } })

export const deleteUser = (userId: string) =>
  api.delete(`/admin/users/${userId}`)

export const getStats = () => api.get('/admin/stats')
