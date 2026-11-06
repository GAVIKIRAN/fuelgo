import { useEffect, useRef, useState } from 'react'
import { providerApi } from '../api'
import { useSocket } from '../context/SocketContext'

const MIN_INTERVAL_MS = 4000

/** Stream the provider's GPS position (Socket.IO, REST fallback) while `enabled`. */
export function useLocationSharing(enabled) {
  const { emit, connected } = useSocket()
  const [error, setError] = useState(null)
  const [last, setLast] = useState(null)
  const lastSent = useRef(0)

  useEffect(() => {
    if (!enabled) return undefined
    if (!('geolocation' in navigator)) {
      setError('Location is not supported on this device.')
      return undefined
    }
    setError(null)
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now()
        if (now - lastSent.current < MIN_INTERVAL_MS) return
        lastSent.current = now
        const body = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setLast({ ...body, at: new Date().toISOString() })
        const res = connected ? await emit('provider:location', body) : null
        if (!res?.ok) providerApi.location(body).catch(() => {})
      },
      (err) => setError(err.code === 1 ? 'Location permission denied. Customers will not see you move on the map.' : 'Could not read your location.'),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    )
    return () => navigator.geolocation.clearWatch(watchId)
  }, [enabled, connected, emit])

  return { error, last }
}
