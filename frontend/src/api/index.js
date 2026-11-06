import api from './client'

const d = (p) => p.then((r) => r.data)

export const authApi = {
  login: (body) => d(api.post('/auth/login', body)),
  register: (body) => d(api.post('/auth/register', body)),
  me: () => d(api.get('/auth/me')),
  updateMe: (body) => d(api.patch('/auth/me', body)),
}

export const metaApi = {
  meta: () => d(api.get('/meta')),
  pricing: () => d(api.get('/pricing')),
}

export const vehicleApi = {
  list: () => d(api.get('/vehicles')),
  create: (body) => d(api.post('/vehicles', body)),
  update: (id, body) => d(api.patch(`/vehicles/${id}`, body)),
  remove: (id) => d(api.delete(`/vehicles/${id}`)),
}

export const requestApi = {
  estimate: (body) => d(api.post('/requests/estimate', body)),
  match: (body) => d(api.post('/requests/match', body)),
  create: (body) => d(api.post('/requests', body)),
  list: (params) => d(api.get('/requests', { params })),
  active: () => d(api.get('/requests/active')),
  get: (id) => d(api.get(`/requests/${id}`)),
  cancel: (id, reason) => d(api.post(`/requests/${id}/cancel`, { reason })),
  tracking: (id) => d(api.get(`/requests/${id}/tracking`)),
  simulate: (id) => d(api.post(`/requests/${id}/simulate`)),
  uploadPhoto: (id, file) => {
    const fd = new FormData()
    fd.append('photo', file)
    return d(api.post(`/requests/${id}/photo`, fd))
  },
}

export const providerApi = {
  profile: () => d(api.get('/provider/profile')),
  updateProfile: (body) => d(api.patch('/provider/profile', body)),
  availability: (body) => d(api.patch('/provider/availability', body)),
  location: (body) => d(api.post('/provider/location', body)),
  incoming: () => d(api.get('/provider/requests/incoming')),
  active: () => d(api.get('/provider/requests/active')),
  history: (params) => d(api.get('/provider/requests/history', { params })),
  accept: (id) => d(api.post(`/provider/requests/${id}/accept`)),
  reject: (id, reason) => d(api.post(`/provider/requests/${id}/reject`, { reason })),
  status: (id, body) => d(api.patch(`/provider/requests/${id}/status`, body)),
  cashReceived: (id) => d(api.post(`/provider/requests/${id}/cash-received`)),
  earnings: () => d(api.get('/provider/earnings')),
  ratings: (params) => d(api.get('/provider/ratings', { params })),
  uploadDocument: (docType, file) => {
    const fd = new FormData()
    fd.append('doc_type', docType)
    fd.append('file', file)
    return d(api.post('/provider/documents', fd))
  },
  deleteDocument: (id) => d(api.delete(`/provider/documents/${id}`)),
}

export const paymentApi = {
  config: () => d(api.get('/payments/config')),
  initiate: (body) => d(api.post('/payments/initiate', body)),
  confirm: (id, body) => d(api.post(`/payments/${id}/confirm`, body)),
  list: (params) => d(api.get('/payments', { params })),
  receipt: (id) => d(api.get(`/payments/${id}/receipt`)),
}

export const feedbackApi = {
  submit: (body) => d(api.post('/feedback', body)),
  complain: (body) => d(api.post('/complaints', body)),
  myComplaints: () => d(api.get('/complaints')),
}

export const notificationApi = {
  list: (params) => d(api.get('/notifications', { params })),
  read: (id) => d(api.patch(`/notifications/${id}/read`)),
  readAll: () => d(api.post('/notifications/read-all')),
}

export const adminApi = {
  dashboard: () => d(api.get('/admin/dashboard')),
  users: (params) => d(api.get('/admin/users', { params })),
  setUserActive: (id, is_active) => d(api.patch(`/admin/users/${id}/status`, { is_active })),
  deleteUser: (id) => d(api.delete(`/admin/users/${id}`)),
  providers: (params) => d(api.get('/admin/providers', { params })),
  verifyProvider: (id, status, note) => d(api.patch(`/admin/providers/${id}/verification`, { status, note })),
  requests: (params) => d(api.get('/admin/requests', { params })),
  cancelRequest: (id, reason) => d(api.post(`/admin/requests/${id}/cancel`, { reason })),
  payments: (params) => d(api.get('/admin/payments', { params })),
  refund: (id, body) => d(api.patch(`/admin/payments/${id}/refund`, body)),
  feedback: (params) => d(api.get('/admin/feedback', { params })),
  complaints: (params) => d(api.get('/admin/complaints', { params })),
  resolveComplaint: (id, resolution_note) => d(api.patch(`/admin/complaints/${id}/resolve`, { resolution_note })),
  pricing: () => d(api.get('/admin/pricing')),
  updatePricing: (body) => d(api.put('/admin/pricing', body)),
  predictDemand: (params) => d(api.get('/admin/ml/predict-demand', { params })),
  insights: () => d(api.get('/admin/ml/insights')),
  retrain: () => d(api.post('/admin/ml/retrain', null, { timeout: 120000 })),
}

/** Download an authenticated file (e.g. provider document) and open it in a new tab. */
export async function openProtectedFile(url) {
  const path = url.replace(/^\/api\/v1/, '')
  const res = await api.get(path, { responseType: 'blob' })
  const blobUrl = URL.createObjectURL(res.data)
  window.open(blobUrl, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
}
