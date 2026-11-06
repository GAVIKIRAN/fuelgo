import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { TrackingMap } from '../../components/Maps'
import StatusTimeline from '../../components/StatusTimeline'
import { EmptyState, Field, Loading, Modal, PageHeader, PriceBreakdown, Spinner, StatusBadge } from '../../components/ui'
import { providerApi, requestApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { useLiveRequest } from '../../hooks/useLiveRequest'
import { useLocationSharing } from '../../hooks/useLocationSharing'
import { NEXT_STATUS, directionsUrl, km, money, serviceTitle } from '../../utils/format'

function JobView({ jobId, onFinished }) {
  const { request: job, tracking, reload } = useLiveRequest(jobId)
  const [sharing, setSharing] = useState(false)
  const { error: shareError, last } = useLocationSharing(sharing && job && ['ACCEPTED', 'EN_ROUTE'].includes(job.status))
  const [busy, setBusy] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [finalPrice, setFinalPrice] = useState('')

  useEffect(() => {
    if (job && finalPrice === '') setFinalPrice(String(job.final_price ?? job.estimated_price ?? ''))
  }, [job, finalPrice])

  if (!job) return <Loading />

  const next = NEXT_STATUS[job.status]
  const advance = async (status, extra = {}) => {
    setBusy(true)
    try {
      await providerApi.status(job.id, { status, ...extra })
      if (status === 'EN_ROUTE') setSharing(true)
      toast.success('Status updated')
      setCompleteOpen(false)
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
      await requestApi.simulate(job.id)
      toast.success('Simulating your drive to the customer')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const cash = async () => {
    setBusy(true)
    try {
      await providerApi.cashReceived(job.id)
      toast.success('Cash payment recorded')
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const done = job.status === 'COMPLETED'
  const paid = job.payment_status === 'SUCCESS'
  const price = Number(finalPrice)
  return (
    <div>
      <PageHeader title={`Job #${job.id}`} subtitle={`${serviceTitle(job)} for ${job.customer_name}`}
        actions={<StatusBadge status={job.status} />} />
      <div className="split">
        <div className="stack">
          <TrackingMap provider={tracking?.provider} destination={{ lat: job.lat, lng: job.lng }}
            providerLabel="You" destinationLabel={job.customer_name} height={380} />
          <div className="card">
            {!done && (
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div>
                  <div className="muted small">To customer</div>
                  <strong style={{ fontSize: '1.3rem' }}>{km(tracking?.distance_km ?? job.distance_km)} · {tracking?.eta_minutes ?? job.eta_minutes ?? '—'} min</strong>
                </div>
                <a className="btn btn-dark" href={directionsUrl(job.lat, job.lng)} target="_blank" rel="noreferrer"><Icon name="navigation" size={18} /> Navigate</a>
              </div>
            )}
            <div className="job-actions">
              {next && next.status !== 'COMPLETED' && (
                <button className="btn btn-primary btn-lg btn-block" disabled={busy} onClick={() => advance(next.status)}>
                  {busy ? <Spinner size={18} /> : next.label}
                </button>
              )}
              {next?.status === 'COMPLETED' && (
                <button className="btn btn-success btn-lg btn-block" disabled={busy} onClick={() => setCompleteOpen(true)}>Complete job</button>
              )}
              {['ACCEPTED', 'EN_ROUTE'].includes(job.status) && (
                <div className="row">
                  <label className="checkbox">
                    <input type="checkbox" checked={sharing} onChange={(e) => setSharing(e.target.checked)} />
                    Share my live location
                  </label>
                  {!tracking?.simulating && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={simulate}><Icon name="play" size={16} /> Simulate drive (demo)</button>}
                  {tracking?.simulating && <span className="badge tone-blue">Simulating…</span>}
                </div>
              )}
              {shareError && <div className="alert alert-warn">{shareError}</div>}
              {sharing && last && <p className="muted small" style={{ margin: 0 }}>Location sent {new Date(last.at).toLocaleTimeString()}</p>}
              {done && !paid && (
                <div className="alert alert-info">
                  <div style={{ flex: 1 }}>
                    <strong>Collect {money(job.final_price)}.</strong> The customer can pay by UPI/card in their app, or hand you cash.
                  </div>
                  <button className="btn btn-dark btn-sm" disabled={busy} onClick={cash}>Cash received</button>
                </div>
              )}
              {done && paid && (
                <div className="alert alert-success"><Icon name="check" size={18} /> Paid. Job closed. <button className="link-btn" onClick={onFinished}>Back to requests</button></div>
              )}
              {job.customer_phone && !done && <a className="btn btn-ghost" href={`tel:${job.customer_phone}`}><Icon name="phone" size={16} /> Call customer</a>}
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <h3>Job details</h3>
            <div className="receipt">
              <div className="receipt-row"><span>Customer</span><span>{job.customer_name}</span></div>
              <div className="receipt-row"><span>Address</span><span style={{ textAlign: 'right' }}>{job.address || job.zone}</span></div>
              {job.vehicle && <div className="receipt-row"><span>Vehicle</span><span>{job.vehicle.make} {job.vehicle.model} · {job.vehicle.registration_number}</span></div>}
              {job.description && <div className="receipt-row"><span>Problem</span><span>{job.description}</span></div>}
            </div>
            {job.photo_url && <img src={job.photo_url} alt="Problem" style={{ marginTop: 10, maxHeight: 160, borderRadius: 8 }} />}
            <hr className="divider" />
            <PriceBreakdown breakdown={job.price_breakdown} finalPrice={job.final_price} />
          </div>
          <div className="card"><h3>Progress</h3><StatusTimeline request={job} /></div>
        </div>
      </div>

      <Modal open={completeOpen} title="Complete job" onClose={() => setCompleteOpen(false)}
        footer={<><button className="btn btn-ghost" onClick={() => setCompleteOpen(false)}>Back</button>
          <button className="btn btn-success" disabled={busy || !(price >= 0) || finalPrice === ''} onClick={() => advance('COMPLETED', { final_price: price })}>{busy ? <Spinner size={16} /> : 'Complete & request payment'}</button></>}>
        <p className="muted">Estimate was {money(job.estimated_price)}. Adjust the final charge if extra parts or work were needed.</p>
        <Field label="Final charge (₹)">
          {(id) => <input id={id} type="number" min={0} step="0.01" value={finalPrice} onChange={(e) => setFinalPrice(e.target.value)} />}
        </Field>
      </Modal>
    </div>
  )
}

export default function ActiveJob() {
  const active = useAsync(() => providerApi.active(), [])
  // After completion the job is no longer "active"; keep showing it until paid.
  const [jobId, setJobId] = useState(null)
  useEffect(() => {
    if (active.data?.request) setJobId(active.data.request.id)
  }, [active.data])

  if (active.loading && !jobId) return <Loading />
  if (!jobId) {
    return (
      <div className="card">
        <EmptyState icon="navigation" title="No active job" text="Accept a request to start a job."
          action={<Link to="/provider/requests" className="btn btn-primary">See incoming requests</Link>} />
      </div>
    )
  }
  return <JobView jobId={jobId} onFinished={() => { setJobId(null); active.reload() }} />
}
