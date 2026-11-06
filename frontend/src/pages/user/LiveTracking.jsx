import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { TrackingMap } from '../../components/Maps'
import StatusTimeline from '../../components/StatusTimeline'
import { ErrorState, Field, Loading, Modal, PriceBreakdown, Spinner, StarRating, StatusBadge } from '../../components/ui'
import { requestApi } from '../../api'
import { demoEmailFor } from '../Login'
import { errorMessage } from '../../api/client'
import { useLiveRequest } from '../../hooks/useLiveRequest'
import { STATUS_LABELS, dateTime, km, money, serviceTitle } from '../../utils/format'

const CANCELLABLE = ['PENDING', 'ACCEPTED', 'EN_ROUTE']
const TRACKABLE = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']

export default function LiveTracking() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { request, tracking, error, loading, reload, setRequest, live } = useLiveRequest(id, {
    onUpdate: (next) => toast(`Status: ${STATUS_LABELS[next.status]}`, { id: `st-${next.id}-${next.status}` }),
  })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (loading) return <Loading text="Loading your request…" />
  if (error && !request) return <ErrorState message={error} onRetry={reload} />
  if (!request) return null

  const provider = request.provider
  const providerPos = tracking?.provider
  const isActive = ['PENDING', ...TRACKABLE].includes(request.status)
  const needsPayment = request.status === 'COMPLETED' && request.payment_status !== 'SUCCESS' && request.payment_status !== 'REFUNDED'
  const amount = request.final_price ?? request.estimated_price

  const cancel = async () => {
    setBusy(true)
    try {
      const updated = await requestApi.cancel(request.id, reason || 'Cancelled by user')
      setRequest((r) => ({ ...r, ...updated }))
      toast.success('Request cancelled')
      setCancelOpen(false)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const simulate = async () => {
    setBusy(true)
    try {
      await requestApi.simulate(request.id)
      toast.success('Simulator started: the provider is driving to you')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="row"><h1>Request #{request.id}</h1><StatusBadge status={request.status} /></div>
          <p className="muted">{serviceTitle(request)} · {dateTime(request.created_at)}</p>
        </div>
        <div className="page-actions">
          {!live && isActive && <span className="badge tone-amber">Live updates paused, refreshing every 5 s</span>}
          <Link to="/app/history" className="btn btn-ghost">History</Link>
        </div>
      </div>

      {needsPayment && (
        <div className="active-banner">
          <div><strong>Service completed.</strong> Amount due: <strong>{money(amount)}</strong></div>
          <button className="btn btn-dark" onClick={() => navigate(`/app/requests/${request.id}/pay`)}><Icon name="card" size={18} /> Pay now</button>
        </div>
      )}
      {request.status === 'COMPLETED' && !needsPayment && !request.has_feedback && (
        <div className="active-banner">
          <div><strong>Paid. Thank you!</strong> How was the service?</div>
          <Link className="btn btn-dark" to={`/app/requests/${request.id}/rate`}><Icon name="star" size={18} /> Rate service</Link>
        </div>
      )}
      {request.status === 'REJECTED' && (
        <div className="alert alert-error"><Icon name="alert" size={18} /> No provider could take this request. Please try again in a few minutes.
          <Link to={request.service_type === 'fuel' ? '/app/fuel' : '/app/mechanic'} className="link-btn" style={{ marginLeft: 8 }}>Request again</Link>
        </div>
      )}

      <div className="split">
        <div className="stack">
          {(TRACKABLE.includes(request.status) || request.status === 'PENDING') && (
            <TrackingMap
              provider={providerPos}
              destination={{ lat: request.lat, lng: request.lng }}
              providerLabel={provider?.business_name}
              destinationLabel="Your location"
              height={380}
            />
          )}
          <div className="card">
            {request.status === 'PENDING' && (
              <div className="row" style={{ marginBottom: 10 }}>
                <Spinner size={18} /> <strong>Offered to {provider?.business_name}. Waiting for them to accept…</strong>
              </div>
            )}
            {request.status === 'PENDING' && demoEmailFor(provider?.business_name) && (
              <div className="test-hints">
                <strong>Demo:</strong> to accept this, sign in (e.g. in a private window) as <code>{demoEmailFor(provider.business_name)}</code> / <code>Provider@123</code> and open <em>Requests</em>.
              </div>
            )}
            {['ACCEPTED', 'EN_ROUTE'].includes(request.status) && (
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div>
                  <div className="muted small">Estimated arrival</div>
                  <div className="eta-box"><span className="eta-num">{tracking?.eta_minutes ?? request.eta_minutes ?? '—'}</span><span>min</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="muted small">Distance</div>
                  <strong>{km(tracking?.distance_km ?? request.distance_km)}</strong>
                </div>
              </div>
            )}
            {request.status === 'ARRIVED' && <div className="alert alert-success"><Icon name="pin" size={18} /> Your provider has arrived.</div>}
            {request.status === 'IN_PROGRESS' && <div className="alert alert-info"><Icon name="wrench" size={18} /> Service in progress.</div>}
            {provider && (
              <div className="provider-strip">
                <span className="avatar">{provider.business_name[0]}</span>
                <div style={{ flex: 1 }}>
                  <strong>{provider.business_name}</strong>
                  <div className="row small muted" style={{ gap: 6 }}>
                    <StarRating value={provider.rating_avg} readOnly size={13} />
                    {provider.rating_count ? provider.rating_avg.toFixed(1) : 'New'} · {provider.name}
                  </div>
                </div>
                {provider.phone && isActive && <a className="btn btn-secondary btn-sm" href={`tel:${provider.phone}`}><Icon name="phone" size={16} /> Call</a>}
              </div>
            )}
            {isActive && (
              <div className="btn-row" style={{ marginTop: 14 }}>
                {['ACCEPTED', 'EN_ROUTE'].includes(request.status) && !tracking?.simulating && (
                  <button className="btn btn-secondary btn-sm" onClick={simulate} disabled={busy} title="Demo mode: moves the provider marker to you">
                    <Icon name="play" size={16} /> Simulate drive (demo)
                  </button>
                )}
                {tracking?.simulating && <span className="badge tone-blue">Simulating drive…</span>}
                {CANCELLABLE.includes(request.status) && (
                  <button className="btn btn-danger-outline btn-sm" onClick={() => setCancelOpen(true)}>Cancel request</button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h3>Progress</h3>
            <StatusTimeline request={request} />
          </div>
          <div className="card">
            <h3>Details</h3>
            <div className="receipt">
              <div className="receipt-row"><span>Service</span><span>{serviceTitle(request)}</span></div>
              {request.vehicle && <div className="receipt-row"><span>Vehicle</span><span>{request.vehicle.make} {request.vehicle.model} · {request.vehicle.registration_number}</span></div>}
              <div className="receipt-row"><span>Location</span><span style={{ textAlign: 'right' }}>{request.address || `${request.lat.toFixed(4)}, ${request.lng.toFixed(4)}`}</span></div>
              {request.description && <div className="receipt-row"><span>Problem</span><span>{request.description}</span></div>}
              {request.cancel_reason && <div className="receipt-row"><span>Cancel reason</span><span>{request.cancel_reason}</span></div>}
            </div>
            {request.photo_url && <img src={request.photo_url} alt="Problem" style={{ marginTop: 10, borderRadius: 8, maxHeight: 180 }} />}
            <hr className="divider" />
            <PriceBreakdown breakdown={request.price_breakdown} finalPrice={request.final_price} />
            {request.payments?.length > 0 && (
              <p className="small muted" style={{ marginTop: 10 }}>
                Payment: {request.payment_status} · {request.payments[request.payments.length - 1].method}
              </p>
            )}
          </div>
        </div>
      </div>

      <Modal open={cancelOpen} title="Cancel this request?" onClose={() => setCancelOpen(false)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => setCancelOpen(false)}>Keep request</button>
          <button className="btn btn-danger" disabled={busy} onClick={cancel}>{busy ? <Spinner size={16} /> : 'Cancel request'}</button>
        </>}>
        <Field label="Reason (optional)">
          {(fid) => (
            <select id={fid} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              <option>Vehicle started on its own</option>
              <option>Found help nearby</option>
              <option>Provider is taking too long</option>
              <option>Booked by mistake</option>
            </select>
          )}
        </Field>
      </Modal>
    </div>
  )
}
