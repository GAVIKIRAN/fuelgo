/**
 * Platform layer: the same React app runs in the browser and inside the Android app
 * (Capacitor). Everything that differs between the two lives here.
 */
import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const platform = Capacitor.getPlatform() // 'web' | 'android' | 'ios'

// ---------------------------------------------------------------- server address
const SERVER_KEY = 'fuelgo.server'

function clean(url) {
  return (url || '').trim().replace(/\/+$/, '')
}

/** Backend origin, e.g. "http://192.168.1.5:5000". Empty on web = same origin / dev proxy. */
export function getServerUrl() {
  try {
    const saved = localStorage.getItem(SERVER_KEY)
    if (saved) return clean(saved)
  } catch {
    /* ignore */
  }
  return clean(import.meta.env.VITE_API_URL)
}

export function setServerUrl(url) {
  try {
    localStorage.setItem(SERVER_KEY, clean(url))
  } catch {
    /* ignore */
  }
}

/** The Android app cannot use relative URLs; it needs a configured server first. */
export function needsServerSetup() {
  return isNative && !getServerUrl()
}

/** Turn an API-relative path ("/api/v1/uploads/...") into a full URL for <img src>. */
export function assetUrl(path) {
  if (!path || /^https?:/.test(path)) return path
  return `${getServerUrl()}${path}`
}

export async function checkServer(url) {
  const base = clean(url)
  if (!/^https?:\/\/[^/]+/.test(base)) throw new Error('Enter a full address like http://192.168.1.5:5000')
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(`${base}/api/v1/health`, { signal: ctrl.signal })
    const data = await res.json()
    if (data.service !== 'fuelgo-api') throw new Error('That server is not a FuelGo API')
    return data
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('No response. Check the address and that your phone is on the same Wi-Fi.')
    throw new Error(err.message?.startsWith('That') ? err.message : 'Could not reach the server. Is it running with --host 0.0.0.0?')
  } finally {
    clearTimeout(t)
  }
}

// ---------------------------------------------------------------- geolocation
const GEO_MESSAGES = {
  denied: 'Location permission denied. Drag the pin or type your address instead.',
  unavailable: 'Your position is unavailable right now. Drag the pin to where you are.',
  timeout: 'Getting your location timed out. Drag the pin or try again.',
}

function webError(err) {
  return new Error({ 1: GEO_MESSAGES.denied, 2: GEO_MESSAGES.unavailable, 3: GEO_MESSAGES.timeout }[err?.code] || 'Could not get your location.')
}

async function nativeGeo() {
  const { Geolocation } = await import('@capacitor/geolocation')
  return Geolocation
}

async function ensureNativePermission(Geolocation) {
  let perm = await Geolocation.checkPermissions()
  if (perm.location !== 'granted') perm = await Geolocation.requestPermissions({ permissions: ['location'] })
  if (perm.location !== 'granted') throw new Error(GEO_MESSAGES.denied)
}

/** One-shot position: {lat, lng, accuracy}. Rejects with a user-friendly Error. */
export async function getPosition({ timeout = 10000 } = {}) {
  if (isNative) {
    const Geolocation = await nativeGeo()
    await ensureNativePermission(Geolocation)
    try {
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout, maximumAge: 30000 })
      return { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }
    } catch (err) {
      throw new Error(/disabled|location services/i.test(err?.message || '') ? 'Turn on Location (GPS) in your phone settings, or drag the pin.' : GEO_MESSAGES.unavailable)
    }
  }
  if (!('geolocation' in navigator)) throw new Error('This browser does not support location. Drag the pin instead.')
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(webError(err)),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    )
  })
}

/** Continuous position updates. Returns a function that stops watching. */
export function watchPosition(onPosition, onError) {
  let stopped = false
  let stop = () => {}
  if (isNative) {
    nativeGeo().then(async (Geolocation) => {
      try {
        await ensureNativePermission(Geolocation)
        if (stopped) return
        const id = await Geolocation.watchPosition({ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }, (p, err) => {
          if (err) onError?.(new Error(GEO_MESSAGES.unavailable))
          else if (p) onPosition({ lat: p.coords.latitude, lng: p.coords.longitude })
        })
        stop = () => Geolocation.clearWatch({ id })
        if (stopped) stop()
      } catch (err) {
        onError?.(err)
      }
    })
  } else if ('geolocation' in navigator) {
    const id = navigator.geolocation.watchPosition(
      (p) => onPosition({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (err) => onError?.(webError(err)),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    stop = () => navigator.geolocation.clearWatch(id)
  } else {
    onError?.(new Error('Location is not supported on this device.'))
  }
  return () => {
    stopped = true
    stop()
  }
}

// ---------------------------------------------------------------- app shell (Android)
let appInBackground = false

/** Back button, status bar, splash, foreground tracking. Call once at startup. */
export async function initNativeShell({ onBack } = {}) {
  if (!isNative) return
  const [{ App }, { StatusBar, Style }, { SplashScreen }] = await Promise.all([
    import('@capacitor/app'), import('@capacitor/status-bar'), import('@capacitor/splash-screen'),
  ])
  document.documentElement.classList.add('native')
  try {
    await StatusBar.setStyle({ style: Style.Dark })
    await StatusBar.setBackgroundColor({ color: '#0f1f3d' })
  } catch {
    /* not supported on every Android version */
  }
  App.addListener('backButton', ({ canGoBack }) => {
    // close an open dialog first, then go back, and exit from the root screens
    const closeBtn = document.querySelector('.modal-backdrop .modal-head button[aria-label="Close"]')
    if (closeBtn) return closeBtn.click()
    if (onBack?.({ canGoBack })) return undefined
    if (canGoBack) return window.history.back()
    return App.exitApp()
  })
  App.addListener('appStateChange', ({ isActive }) => {
    appInBackground = !isActive
  })
  SplashScreen.hide().catch(() => {})
}

// ---------------------------------------------------------------- notifications
let notifPermission = null

/** Show an Android system notification when the app is in the background. */
export async function systemNotify(n) {
  if (!isNative || !appInBackground) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    if (notifPermission === null) notifPermission = (await LocalNotifications.requestPermissions()).display === 'granted'
    if (!notifPermission) return
    await LocalNotifications.schedule({
      notifications: [{ id: n.id % 2147483647, title: n.title, body: n.message, extra: { request_id: n.request_id } }],
    })
  } catch {
    /* best effort */
  }
}

/** Ask for notification permission early (Android 13+ requires it). */
export async function requestNotificationPermission() {
  if (!isNative) return
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    notifPermission = (await LocalNotifications.requestPermissions()).display === 'granted'
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- misc
export async function vibrate() {
  if (!isNative) return
  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
    await Haptics.impact({ style: ImpactStyle.Medium })
  } catch {
    /* ignore */
  }
}

/** Share text (receipt) via the Android share sheet; falls back to Web Share / clipboard. */
export async function shareText(title, text) {
  if (isNative) {
    const { Share } = await import('@capacitor/share')
    await Share.share({ title, text, dialogTitle: title })
    return 'shared'
  }
  if (navigator.share) {
    await navigator.share({ title, text })
    return 'shared'
  }
  await navigator.clipboard?.writeText(text)
  return 'copied'
}
