import { useEffect, useRef, useState } from 'react'
import { providerApi } from '../api'
import { useSocket } from '../context/SocketContext'
import { watchPosition } from '../platform'

const MIN_INTERVAL_MS = 4000

/** Stream the provider's GPS position (Socket.IO, REST fallback) while `enabled`. */
export function useLocationSharing(enabled) {
  const { emit, connected } = useSocket()
  const [error, setError] = useState(null)
  const [last, setLast] = useState(null)
  const lastSent = useRef(0)
  const connectedRef = useRef(connected)
  connectedRef.current = connected

  useEffect(() => {
    if (!enabled) return undefined
    setError(null)
    return watchPosition(
      async (body) => {
        const now = Date.now()
        if (now - lastSent.current < MIN_INTERVAL_MS) return
        lastSent.current = now
        setLast({ ...body, at: new Date().toISOString() })
        const res = connectedRef.current ? await emit('provider:location', body) : null
        if (!res?.ok) providerApi.location(body).catch(() => {})
      },
      (err) => setError(`${err.message} Customers will not see you move on the map.`),
    )
  }, [enabled, emit])

  return { error, last }
}
