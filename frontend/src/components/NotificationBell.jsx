import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { Spinner } from './ui'
import { notificationApi } from '../api'
import { useSocket } from '../context/SocketContext'
import { useAuth } from '../context/AuthContext'
import { timeAgo } from '../utils/format'

export default function NotificationBell() {
  const { unread, setUnread, lastNotification } = useSocket()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const data = await notificationApi.list({ per_page: 15 })
      setItems(data.items)
      setUnread(data.unread_count)
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lastNotification])

  useEffect(() => {
    const onClick = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const openItem = async (n) => {
    if (!n.is_read) {
      notificationApi.read(n.id).catch(() => {})
      setUnread((u) => Math.max(0, u - 1))
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
    }
    if (n.request_id) {
      setOpen(false)
      if (user.role === 'user') navigate(`/app/requests/${n.request_id}`)
      else if (user.role === 'provider') navigate('/provider/job')
      else navigate('/admin/requests')
    }
  }

  const readAll = async () => {
    await notificationApi.readAll()
    setUnread(0)
    setItems((list) => list?.map((x) => ({ ...x, is_read: true })))
  }

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen((o) => !o)}>
        <Icon name="bell" />
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="bell-head">
            <strong>Notifications</strong>
            {unread > 0 && <button className="link-btn" onClick={readAll}>Mark all read</button>}
          </div>
          <div className="bell-list">
            {items === null && <div className="bell-empty"><Spinner /></div>}
            {items?.length === 0 && <div className="bell-empty">You're all caught up.</div>}
            {items?.map((n) => (
              <button key={n.id} className={`bell-item ${n.is_read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <span className="bell-title">{n.title}</span>
                <span className="bell-msg">{n.message}</span>
                <span className="bell-time">{timeAgo(n.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
