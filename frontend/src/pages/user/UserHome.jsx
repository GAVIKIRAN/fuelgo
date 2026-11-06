import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../../components/Icon'
import { EmptyState, Loading, Modal, StatusBadge } from '../../components/ui'
import { requestApi, vehicleApi } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { money, serviceTitle, shortDate } from '../../utils/format'

export default function UserHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sos, setSos] = useState(false)
  const active = useAsync(() => requestApi.active(), [])
  const recent = useAsync(() => requestApi.list({ per_page: 4 }), [])
  const vehicles = useAsync(() => vehicleApi.list(), [])
  const activeReq = active.data?.request

  return (
    <div className="stack">
      <div>
        <h1>Hi {user.name.split(' ')[0]}</h1>
        <p className="muted" style={{ margin: 0 }}>What do you need help with?</p>
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

      <div className="sos-card">
        <div>
          <h2 style={{ color: '#fff', fontSize: '1.5rem' }}>Stranded on the road?</h2>
          <p>Tap Request Help. We'll find your location and the nearest verified provider. Fuel arrives in about 20 minutes on average.</p>
        </div>
        <button className="sos-btn" disabled={Boolean(activeReq)}
          onClick={() => setSos(true)} aria-label="Request emergency help">
          <Icon name="alert" size={34} strokeWidth={2.4} />
          SOS
          <small>Request Help</small>
        </button>
      </div>

      <Modal open={sos} title="What happened?" onClose={() => setSos(false)}>
        <p className="muted">We'll use your current location and send the nearest available provider automatically.</p>
        <div className="quick-actions" style={{ gridTemplateColumns: '1fr' }}>
          <button className="quick-action" style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={() => navigate('/app/fuel?sos=1')}>
            <span className="qa-icon fuel"><Icon name="fuel" size={24} /></span>
            <div><strong>I ran out of fuel</strong><span>Emergency fuel delivery</span></div>
          </button>
          <button className="quick-action" style={{ cursor: 'pointer', font: 'inherit', textAlign: 'left' }} onClick={() => navigate('/app/mechanic?sos=1')}>
            <span className="qa-icon mech"><Icon name="wrench" size={24} /></span>
            <div><strong>My vehicle broke down</strong><span>Mechanic or towing</span></div>
          </button>
        </div>
      </Modal>

      <div className="quick-actions">
        <Link to="/app/fuel" className="quick-action">
          <span className="qa-icon fuel"><Icon name="fuel" size={24} /></span>
          <div><strong>Fuel delivery</strong><span>Petrol, diesel or CNG to your spot</span></div>
        </Link>
        <Link to="/app/mechanic" className="quick-action">
          <span className="qa-icon mech"><Icon name="wrench" size={24} /></span>
          <div><strong>Mechanic help</strong><span>Tyre, battery, engine or towing</span></div>
        </Link>
      </div>

      {vehicles.data && vehicles.data.items.length === 0 && (
        <div className="alert alert-info">
          <Icon name="car" size={18} /> Add your vehicle in <Link to="/app/profile">Profile</Link> so requests are faster and the right fuel is pre-selected.
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Recent requests</h2>
          <Link to="/app/history" className="link-btn">View all</Link>
        </div>
        {recent.loading ? <Loading /> : recent.data?.items.length ? (
          <div className="list">
            {recent.data.items.map((r) => (
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
    </div>
  )
}
