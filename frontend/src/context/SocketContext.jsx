import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import toast from 'react-hot-toast'
import { apiBase, tokenStore } from '../api/client'
import { systemNotify, vibrate } from '../platform'
import { notificationApi } from '../api'
import { useAuth } from './AuthContext'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const { user } = useAuth()
  const socketRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [unread, setUnread] = useState(0)
  const [lastNotification, setLastNotification] = useState(null)

  const refreshUnread = useCallback(async () => {
    if (!user) return
    try {
      const data = await notificationApi.list({ per_page: 1 })
      setUnread(data.unread_count)
    } catch {
      /* ignore */
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      setUnread(0)
      return undefined
    }
    refreshUnread()
    const socket = io(apiBase() || undefined, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: tokenStore.get()?.access_token }),
      reconnectionDelayMax: 8000,
    })
    socketRef.current = socket
    socket.on('connect', () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => setConnected(false))
    socket.on('notification', (n) => {
      setUnread((u) => u + 1)
      setLastNotification(n)
      toast(`${n.title}: ${n.message}`, { id: `n-${n.id}`, duration: 5000 })
      systemNotify(n) // Android system notification when the app is in the background
      vibrate()
    })
    // Fallback polling for the unread badge if the socket can't connect
    const timer = setInterval(() => {
      if (!socket.connected) refreshUnread()
    }, 20000)
    return () => {
      clearInterval(timer)
      socket.disconnect()
      socketRef.current = null
      setConnected(false)
    }
  }, [user, refreshUnread])

  const on = useCallback((event, handler) => {
    const s = socketRef.current
    if (!s) return () => {}
    s.on(event, handler)
    return () => s.off(event, handler)
  }, [])

  const emit = useCallback((event, data) => {
    const s = socketRef.current
    if (!s || !s.connected) return Promise.resolve({ ok: false, error: 'offline' })
    return new Promise((resolve) => s.timeout(5000).emit(event, data, (err, res) => resolve(err ? { ok: false } : res)))
  }, [])

  return (
    <SocketContext.Provider value={{ connected, on, emit, unread, setUnread, refreshUnread, lastNotification }}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  return useContext(SocketContext)
}
