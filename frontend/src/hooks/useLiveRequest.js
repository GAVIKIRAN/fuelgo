import { useCallback, useEffect, useRef, useState } from 'react'
import { requestApi } from '../api'
import { errorMessage } from '../api/client'
import { useSocket } from '../context/SocketContext'

const POLL_MS = 5000

/**
 * Subscribe to a request: Socket.IO room `request_<id>` for `request:update` and
 * `tracking:update`, falling back to REST polling while the socket is offline.
 */
export function useLiveRequest(id, { onUpdate } = {}) {
  const { connected, on, emit } = useSocket()
  const [request, setRequest] = useState(null)
  const [tracking, setTracking] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  const load = useCallback(async () => {
    try {
      const [req, tr] = await Promise.all([requestApi.get(id), requestApi.tracking(id)])
      setRequest(req)
      setTracking(tr)
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // socket room + events
  useEffect(() => {
    if (!connected) return undefined
    emit('request:join', { request_id: Number(id) }).then((res) => {
      if (res?.ok && res.tracking) setTracking(res.tracking)
    })
    const offReq = on('request:update', (data) => {
      if (String(data.id) !== String(id)) return
      setRequest((prev) => {
        if (prev && prev.status !== data.status) onUpdateRef.current?.(data, prev)
        return { ...(prev || {}), ...data }
      })
      requestApi.tracking(id).then(setTracking).catch(() => {})
      // refresh history / payments once in a while
      requestApi.get(id).then(setRequest).catch(() => {})
    })
    const offTrack = on('tracking:update', (data) => {
      if (String(data.request_id) === String(id)) setTracking(data)
    })
    return () => {
      offReq()
      offTrack()
      emit('request:leave', { request_id: Number(id) })
    }
  }, [connected, id, on, emit])

  // polling fallback
  useEffect(() => {
    if (connected) return undefined
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [connected, load])

  return { request, tracking, error, loading, reload: load, setRequest, live: connected }
}
