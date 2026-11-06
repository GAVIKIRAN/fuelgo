import axios from 'axios'
import { getServerUrl } from '../platform'

/** Backend origin ('' on web = same origin via the dev proxy / nginx). */
export const apiBase = () => getServerUrl()
const TOKEN_KEY = 'fuelgo.tokens'

function read(storage) {
  try {
    return JSON.parse(storage.getItem(TOKEN_KEY)) || null
  } catch {
    return null
  }
}
function write(storage, value) {
  try {
    if (value) storage.setItem(TOKEN_KEY, JSON.stringify(value))
    else storage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable (private mode) */
  }
}

/**
 * Each tab keeps its own session (sessionStorage), so a vehicle owner and a provider
 * can be signed in side by side in two tabs. localStorage only remembers the last
 * login so that new tabs and browser restarts start signed in.
 */
export const tokenStore = {
  get() {
    const own = read(sessionStorage)
    if (own) return own
    const shared = read(localStorage)
    if (shared) write(sessionStorage, shared) // pin this tab to the session it started with
    return shared
  },
  set(tokens) {
    write(sessionStorage, tokens)
    write(localStorage, tokens)
  },
  clear() {
    const own = read(sessionStorage)
    const shared = read(localStorage)
    write(sessionStorage, null)
    // only forget the remembered login if it belongs to this tab
    if (!own || shared?.refresh_token === own.refresh_token) write(localStorage, null)
  },
}

const api = axios.create({ baseURL: '/api/v1', timeout: 30000 })

api.interceptors.request.use((config) => {
  config.baseURL = `${apiBase()}/api/v1` // server address can change at runtime (Android app)
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
  const { data } = await axios.post(`${apiBase()}/api/v1/auth/refresh`, null, {
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
