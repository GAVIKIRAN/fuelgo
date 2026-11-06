import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { assetUrl } from '../../platform'
import { TrackingMap } from '../../components/Maps'
import { EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Spinner } from '../../components/ui'
import { providerApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useSocket } from '../../context/SocketContext'
import { useAsync } from '../../hooks/useAsync'
import { directionsUrl, km, money, serviceTitle, timeAgo } from '../../utils/format'

export default function IncomingRequests() {
  const navigate = useNavigate()
  const { on } = useSocket()
  const list = useAsync(() => providerApi.incoming(), [])
  const profile = useAsync(() => providerApi.profile(), [])
  const [busy, setBusy] = useState(null)
  const [rejecting, setRejecting] = useState(null)
  const [reason, setReason] = useState('')

  useEffect(() => {
    const refresh = () => list.reload({ silent: true })
    const a = on('request:new', (r) => {
      toast(`New request: ${serviceTitle(r)}`, { id: `new-${r.id}` })
      refresh()
    })
    const b = on('request:update', refresh)
    const t = setInterval(refresh, 15000) // safety net if the socket drops
    return () => { a(); b(); clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])

  const accept = async (r) => {
    setBusy(r.id)
    try {
      await providerApi.accept(r.id)
      toast.success('Job accepted. Head to the customer.')
      navigate('/provider/job')
    } catch (err) {
      toast.error(errorMessage(err))
      list.reload({ silent: true })
    } finally {
      setBusy(null)
    }
  }

  const reject = async () => {
    setBusy(rejecting.id)
    try {
      const res = await providerApi.reject(rejecting.id, reason || 'Not available')
      toast(res.reassigned ? 'Declined. Passed to the next nearest provider.' : 'Declined.')
      setRejecting(null)
      setReason('')
      list.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  const me = profile.data
  return (
    <div>
      <PageHeader title="Incoming requests" subtitle="Accept quickly. Unanswered requests move to other providers when you decline." />
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.items.length === 0 ? (
        <div className="card">
          <EmptyState icon="list" title="No pending requests"
            text={me && !me.is_available
              ? 'You are offline. Go online from the dashboard to receive requests.'
              : `Each request is offered to the single best-matched ${me?.provider_type === 'fuel' ? 'fuel partner' : 'mechanic'} (nearest, best rated, free). New ones for you appear here instantly. Your service radius is ${me?.service_radius_km ?? '—'} km around your last location.`} />
        </div>
      ) : (
        <div className="stack">
          {list.data.items.map((r) => (
            <div key={r.id} className="card">
              <div className="split">
                <div>
                  <div className="row-between">
                    <h2 style={{ margin: 0 }}>{serviceTitle(r)}</h2>
                    <strong style={{ fontSize: '1.25rem' }}>{money(r.estimated_price)}</strong>
                  </div>
                  <p className="muted" style={{ marginTop: 4 }}>#{r.id} · {timeAgo(r.created_at)} · {km(r.distance_km)} away · ETA {r.eta_minutes} min</p>
                  <div className="receipt">
                    <div className="receipt-row"><span>Customer</span><span>{r.customer_name}</span></div>
                    <div className="receipt-row"><span>Location</span><span style={{ textAlign: 'right' }}>{r.address || r.zone}</span></div>
                    {r.vehicle && <div className="receipt-row"><span>Vehicle</span><span>{r.vehicle.make} {r.vehicle.model} · {r.vehicle.registration_number}</span></div>}
                    {r.description && <div className="receipt-row"><span>Problem</span><span>{r.description}</span></div>}
                  </div>
                  {r.photo_url && <img src={assetUrl(r.photo_url)} alt="Problem" style={{ marginTop: 10, maxHeight: 140, borderRadius: 8 }} />}
                  <div className="btn-row" style={{ marginTop: 16 }}>
                    <button className="btn btn-success btn-lg" disabled={busy === r.id} onClick={() => accept(r)}>
                      {busy === r.id ? <Spinner size={18} /> : <><Icon name="check" /> Accept</>}
                    </button>
                    <button className="btn btn-danger-outline btn-lg" disabled={busy === r.id} onClick={() => setRejecting(r)}>Decline</button>
                    <a className="btn btn-ghost" href={directionsUrl(r.lat, r.lng)} target="_blank" rel="noreferrer"><Icon name="navigation" size={16} /> Directions</a>
                  </div>
                </div>
                <TrackingMap provider={me?.lat != null ? { lat: me.lat, lng: me.lng } : null} destination={{ lat: r.lat, lng: r.lng }}
                  providerLabel="You" destinationLabel={r.customer_name} height={260} />
              </div>
            </div>
          ))}
        </div>
      )}
      <Modal open={Boolean(rejecting)} title="Decline this request?" onClose={() => setRejecting(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setRejecting(null)}>Back</button><button className="btn btn-danger" disabled={Boolean(busy)} onClick={reject}>Decline</button></>}>
        <p className="muted">We'll pass it to the next nearest provider automatically.</p>
        <Field label="Reason">
          {(id) => (
            <select id={id} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Not available</option>
              <option>Too far away</option>
              <option>Low on fuel stock</option>
              <option>Don't have the right tools</option>
              <option>Vehicle issue</option>
            </select>
          )}
        </Field>
      </Modal>
    </div>
  )
}
