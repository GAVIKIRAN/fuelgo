import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_URL || ''
const TOKEN_KEY = 'fuelgo.tokens'

export const tokenStore = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(TOKEN_KEY)) || null
    } catch {
      return null
    }
  },
  set(tokens) {
    try {
      localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
    } catch {
      /* storage unavailable (private mode) */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* ignore */
    }
  },
}

const api = axios.create({ baseURL: `${API_BASE}/api/v1`, timeout: 30000 })

api.interceptors.request.use((config) => {
  const tokens = tokenStore.get()
  if (tokens?.access_token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${tokens.access_token}`
  }
  return config
})

let refreshing = null
let onLogout = () => {}
export function setLogoutHandler(fn) {
  onLogout = fn
}

async function refreshAccessToken() {
  const tokens = tokenStore.get()
  if (!tokens?.refresh_token) throw new Error('no refresh token')
  const { data } = await axios.post(`${API_BASE}/api/v1/auth/refresh`, null, {
    headers: { Authorization: `Bearer ${tokens.refresh_token}` },
  })
  tokenStore.set({ ...tokens, access_token: data.access_token })
  return data.access_token
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = error.response?.status
    const code = error.response?.data?.error?.code
    const isAuthCall = original?.url?.startsWith('/auth/login') || original?.url?.startsWith('/auth/refresh')
    if (status === 401 && !original._retried && !isAuthCall && tokenStore.get()?.refresh_token) {
      original._retried = true
      try {
        refreshing = refreshing || refreshAccessToken()
        const access = await refreshing
        refreshing = null
        original.headers.Authorization = `Bearer ${access}`
        return api(original)
      } catch {
        refreshing = null
        tokenStore.clear()
        onLogout()
      }
    } else if (status === 403 && code === 'FORBIDDEN' && /blocked/i.test(error.response?.data?.error?.message || '')) {
      tokenStore.clear()
      onLogout()
    }
    return Promise.reject(error)
  },
)

/** Human-readable message from an Axios error using the API's error format. */
export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback
  if (err.code === 'ECONNABORTED') return 'The server took too long to respond.'
  if (!err.response) return 'Cannot reach the FuelGo server. Check your connection.'
  const e = err.response.data?.error
  if (!e) return fallback
  if (e.details && typeof e.details === 'object' && e.code === 'VALIDATION_ERROR') {
    const first = Object.entries(e.details)[0]
    if (first) {
      const [field, msgs] = first
      const msg = Array.isArray(msgs) ? msgs[0] : typeof msgs === 'string' ? msgs : JSON.stringify(msgs)
      return `${field.replace(/_/g, ' ')}: ${msg}`
    }
  }
  return e.message || fallback
}

/** Field errors map from a 422 response: {field: "message"} */
export function fieldErrors(err) {
  const details = err?.response?.data?.error?.details
  if (!details || typeof details !== 'object') return {}
  return Object.fromEntries(
    Object.entries(details).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]),
  )
}

export default api
