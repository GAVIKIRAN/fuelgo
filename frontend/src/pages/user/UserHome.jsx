import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Gauge, PillBars, lastDays } from '../../components/Charts'
import { EmptyState, Loading, Modal, StatCard, StatusBadge } from '../../components/ui'
import { requestApi, vehicleApi } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { ACTIVE_STATUSES, money, serviceTitle, shortDate } from '../../utils/format'

export default function UserHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sos, setSos] = useState(false)
  const active = useAsync(() => requestApi.active(), [])
  const recent = useAsync(() => requestApi.list({ per_page: 60 }), [])
  const done = useAsync(() => requestApi.list({ status: 'COMPLETED', per_page: 1 }), [])
  const vehicles = useAsync(() => vehicleApi.list(), [])
  const activeReq = active.data?.request

  const items = recent.data?.items || []
  const total = recent.data?.pagination?.total ?? (recent.data ? items.length : undefined)
  const completed = done.data?.pagination?.total ?? 0
  const inProgress = items.filter((r) => ACTIVE_STATUSES.includes(r.status)).length
  const closed = Math.max(0, (total ?? 0) - completed - inProgress)
  const week = lastDays(items)
  const vehicleCount = vehicles.data?.items.length

  return (
    <div className="stack">
      <div className="page-header" style={{ marginBottom: 4 }}>
        <div>
          <h1>Hi {user.name.split(' ')[0]}</h1>
          <p className="muted">What do you need help with?</p>
        </div>
        <div className="page-actions">
          <Link to="/app/fuel" className="btn btn-primary"><Icon name="fuel" size={18} /> Order fuel</Link>
          <Link to="/app/mechanic" className="btn btn-secondary"><Icon name="wrench" size={18} /> Get a mechanic</Link>
        </div>
      </div>

      {activeReq && (
        <div className="active-banner">
          <div>
            <strong>Request #{activeReq.id} · {serviceTitle(activeReq)}</strong>
            <div className="row small" style={{ marginTop: 4 }}>
              <StatusBadge status={activeReq.status} />
              {activeReq.eta_minutes != null && activeReq.status !== 'ARRIVED' && <span>ETA {activeReq.eta_minutes} min</span>}
            </div>
          </div>
          <Link to={`/app/requests/${activeReq.id}`} className="btn btn-dark">Track live <Icon name="chevronRight" size={16} /></Link>
        </div>
      )}

      {vehicles.data && vehicleCount === 0 && (
        <div className="alert alert-info" style={{ marginBottom: 0 }}>
          <Icon name="car" size={18} /> <span>New here? <Link to="/app/welcome">Finish setting up</Link>: add your vehicle so requests are faster and the right fuel is pre-selected.</span>
        </div>
      )}

      <div className="dash-grid">
        <div className="col-3 half-sm"><StatCard featured label="Total requests" num={total} hint="Fuel and mechanic" to="/app/history" /></div>
        <div className="col-3 half-sm"><StatCard label="Completed" num={done.data ? completed : undefined} hint="Finished and paid" icon="check" /></div>
        <div className="col-3 half-sm"><StatCard label="In progress" num={recent.data ? inProgress : undefined} hint={activeReq ? `Request #${activeReq.id}` : 'Nothing open'} icon="navigation" /></div>
        <div className="col-3 half-sm"><StatCard label="Vehicles" num={vehicleCount} hint="Saved to your profile" to="/app/profile" /></div>

        <div className="card dash-card col-5">
          <div className="card-head"><h2>Your last 7 days</h2><span className="muted small">requests per day</span></div>
          <PillBars data={week} format={(v) => `${v} request${v === 1 ? '' : 's'}`} />
        </div>

        <div className="card dash-card col-4 half">
          <div className="card-head"><h2>Quick book</h2></div>
          <div className="quick-actions" style={{ gridTemplateColumns: '1fr', gap: 10 }}>
            <Link to="/app/fuel" className="quick-action" style={{ background: 'var(--surface-2)' }}>
              <span className="qa-icon fuel"><Icon name="fuel" size={24} /></span>
              <div><strong>Fuel delivery</strong><span>Petrol, diesel or CNG to your spot</span></div>
            </Link>
            <Link to="/app/mechanic" className="quick-action" style={{ background: 'var(--surface-2)' }}>
              <span className="qa-icon mech"><Icon name="wrench" size={24} /></span>
              <div><strong>Mechanic help</strong><span>Tyre, battery, engine or towing</span></div>
            </Link>
          </div>
        </div>

        <div className="col-3 half-sm">
          <div className="sos-card compact">
            <div>
              <h2 style={{ color: '#fff', fontSize: '1.25rem' }}>Stranded on the road?</h2>
              <p className="small">We find your location and send the nearest verified provider.</p>
            </div>
            {activeReq ? (
              // One active request at a time: SOS takes you to the help already on the way.
              <button className="sos-btn" onClick={() => navigate(`/app/requests/${activeReq.id}`)}
                aria-label={`You already have an active request #${activeReq.id}. Open it`}>
                <Icon name="navigation" size={30} strokeWidth={2.4} />
                Help is on the way
                <small>Track request #{activeReq.id}</small>
              </button>
            ) : (
              <button className="sos-btn" onClick={() => setSos(true)} aria-label="Request emergency help">
                <Icon name="alert" size={34} strokeWidth={2.4} />
                SOS
                <small>Request Help</small>
              </button>
            )}
          </div>
        </div>

        <div className="card dash-card col-8">
          <div className="card-head">
            <h2>Recent requests</h2>
            <Link to="/app/history" className="pill-link">View all</Link>
          </div>
          {recent.loading ? <Loading /> : items.length ? (
            <div className="list">
              {items.slice(0, 4).map((r) => (
                <Link key={r.id} to={`/app/requests/${r.id}`} className="list-item">
                  <span className={`li-icon ${r.service_type === 'fuel' ? 'fuel' : ''}`}><Icon name={r.service_type === 'fuel' ? 'fuel' : 'wrench'} /></span>
                  <div className="li-main">
                    <div className="li-title">{serviceTitle(r)}</div>
                    <div className="li-sub">{shortDate(r.created_at)} · {r.provider?.business_name || 'Unassigned'}</div>
                  </div>
                  <div className="li-end">
                    <StatusBadge status={r.status} />
                    <span className="small">{money(r.final_price ?? r.estimated_price)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState icon="history" title="No requests yet" text="Your fuel deliveries and mechanic visits will appear here." />
          )}
        </div>

        <div className="card dash-card col-4">
          <div className="card-head"><h2>Request outcomes</h2></div>
          <Gauge value={total ? completed / total : 0} label="completed" />
          <div className="legend">
            <span><i style={{ '--c': 'var(--ember)' }} /> Completed {completed}</span>
            <span><i style={{ '--c': 'var(--text)' }} /> In progress {inProgress}</span>
            <span><i className="hatch" /> Closed {closed}</span>
          </div>
        </div>
      </div>

      <Modal open={sos} title="What happened?" onClose={() => setSos(false)}>
        <p className="muted">We'll use your current location and send the nearest available provider automatically.</p>
        <div className="quick-actions" style={{ gridTemplateColumns: '1fr' }}>
          <button className="quick-action" style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left', background: 'var(--surface-2)' }} onClick={() => navigate('/app/fuel?sos=1')}>
            <span className="qa-icon fuel"><Icon name="fuel" size={24} /></span>
            <div><strong>I ran out of fuel</strong><span>Emergency fuel delivery</span></div>
          </button>
          <button className="quick-action" style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left', background: 'var(--surface-2)' }} onClick={() => navigate('/app/mechanic?sos=1')}>
            <span className="qa-icon mech"><Icon name="wrench" size={24} /></span>
            <div><strong>My vehicle broke down</strong><span>Mechanic or towing</span></div>
          </button>
        </div>
      </Modal>
    </div>
  )
}
