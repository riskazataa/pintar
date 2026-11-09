import api from '../api/axios'

export const getSubmissionLock = () =>
  api.get<{ locked: boolean }>('/admin/submission-lock')

export const setSubmissionLock = (locked: boolean) =>
  api.patch<{ locked: boolean }>('/admin/submission-lock', { locked })
