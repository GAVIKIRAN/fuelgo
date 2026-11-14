import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { Gauge, PillBars } from '../../components/Charts'
import { getPosition } from '../../platform'
import { Loading, StatCard, StatusBadge } from '../../components/ui'
import { providerApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useSocket } from '../../context/SocketContext'
import { useAsync } from '../../hooks/useAsync'
import { km, money, serviceTitle, timeAgo } from '../../utils/format'

function currentPosition() {
  return getPosition({ timeout: 8000 }).catch(() => null)
}

export function VerificationBanner({ profile }) {
  if (profile.is_verified) return null
  const s = profile.verification_status
  return (
    <div className={`alert ${s === 'PENDING' ? 'alert-warn' : 'alert-error'}`}>
      <Icon name="shield" size={18} />
      <div>
        {s === 'PENDING' && <><strong>Verification pending.</strong> Follow the <Link to="/provider/welcome">getting-started steps</Link> and upload your documents. An admin will review them before you can go online.</>}
        {s === 'REJECTED' && <><strong>Verification rejected.</strong> {profile.verification_note} Upload updated documents to re-apply.</>}
        {s === 'SUSPENDED' && <><strong>Account suspended.</strong> {profile.verification_note} Contact FuelGo support.</>}
      </div>
    </div>
  )
}

export default function ProviderDashboard() {
  const { user } = useAuth()
  const { on } = useSocket()
  const profile = useAsync(() => providerApi.profile(), [])
  const earnings = useAsync(() => providerApi.earnings(), [])
  const incoming = useAsync(() => providerApi.incoming(), [])
  const active = useAsync(() => providerApi.active(), [])
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    const refresh = () => {
      incoming.reload({ silent: true })
      active.reload({ silent: true })
    }
    const a = on('request:new', refresh)
    const b = on('request:update', refresh)
    return () => { a(); b() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on])

  if (profile.loading) return <Loading />
  const p = profile.data
  if (!p) return null

  const toggle = async () => {
    setToggling(true)
    try {
      const body = { is_available: !p.is_available }
      if (!p.is_available) Object.assign(body, (await currentPosition()) || {})
      const updated = await providerApi.availability(body)
      profile.setData((d) => ({ ...d, ...updated }))
      toast.success(updated.is_available ? 'You are online and can receive requests' : 'You are offline')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setToggling(false)
    }
  }

  const e = earnings.data
  const job = active.data?.request
  return (
    <div className="stack">
      <div>
        <h1>Hello, {user.name.split(' ')[0]}</h1>
        <p className="muted" style={{ margin: 0 }}>{p.business_name} · {p.provider_type === 'fuel' ? 'Fuel delivery' : 'Mechanic'} · {p.zone || 'Mysuru'}</p>
      </div>
      <VerificationBanner profile={p} />

      <div className="availability">
        <div>
          <h2 style={{ color: '#fff', margin: 0 }}>{p.is_available ? 'You are online' : 'You are offline'}</h2>
          <p>{p.is_available ? 'Nearby customers can book you. Stay near your service area.' : 'Go online to start receiving nearby requests.'}</p>
        </div>
        <button className={`switch ${p.is_available ? 'on' : ''}`} onClick={toggle} disabled={toggling || (!p.is_verified && !p.is_available)}
          role="switch" aria-checked={p.is_available} aria-label="Availability" />
      </div>

      {job && (
        <div className="active-banner">
          <div>
            <strong>Active job #{job.id} · {serviceTitle(job)}</strong>
            <div className="row small" style={{ marginTop: 4 }}><StatusBadge status={job.status} /> {job.customer_name} · {km(job.distance_km)}</div>
          </div>
          <Link to="/provider/job" className="btn btn-dark">Open job <Icon name="chevronRight" size={16} /></Link>
        </div>
      )}

      <div className="dash-grid">
        <div className="col-3 half-sm"><StatCard featured label="Today" num={e?.today} format={money} hint="Net of commission" to="/provider/earnings" /></div>
        <div className="col-3 half-sm"><StatCard label="This week" num={e?.this_week} format={money} hint="Last 7 days" icon="chart" /></div>
        <div className="col-3 half-sm"><StatCard label="Completed jobs" num={e?.completed_jobs} hint="All time" icon="check" /></div>
        <div className="col-3 half-sm"><StatCard label="Rating" value={p.rating_count ? `${p.rating_avg.toFixed(1)} / 5` : 'New'} hint={`${p.rating_count} reviews`} icon="star" /></div>

        <div className="card dash-card col-5">
          <div className="card-head"><h2>Earnings, last 7 days</h2><Link to="/provider/earnings" className="pill-link">Details</Link></div>
          {e?.daily ? (
            <PillBars format={money} data={e.daily.map((x) => {
              const day = new Date(x.date)
              return { value: x.earnings, label: day.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 1), full: day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) }
            })} />
          ) : <Loading />}
        </div>

        <div className="card dash-card col-4">
          <div className="card-head">
            <h2>Incoming requests</h2>
            <Link to="/provider/requests" className="pill-link">View all</Link>
          </div>
          {incoming.data?.items.length ? (
            <div className="list">
              {incoming.data.items.slice(0, 3).map((r) => (
                <Link to="/provider/requests" key={r.id} className="list-item">
                  <span className={`li-icon ${r.service_type === 'fuel' ? 'fuel' : ''}`}><Icon name={r.service_type === 'fuel' ? 'fuel' : 'wrench'} /></span>
                  <div className="li-main">
                    <div className="li-title">{serviceTitle(r)}</div>
                    <div className="li-sub">{km(r.distance_km)} away · {r.address || r.zone} · {timeAgo(r.created_at)}</div>
                  </div>
                  <strong>{money(r.estimated_price)}</strong>
                </Link>
              ))}
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>{p.is_available ? 'No pending requests. New ones appear here instantly.' : 'Go online to receive requests.'}</p>}
        </div>

        <div className="card dash-card col-3">
          <div className="card-head"><h2>Customer rating</h2></div>
          <Gauge value={p.rating_count ? p.rating_avg / 5 : 0} label={p.rating_count ? `${p.rating_avg.toFixed(1)} of 5 stars` : 'no reviews yet'} />
          <div className="legend"><span><i style={{ '--c': 'var(--ember)' }} /> {p.rating_count} reviews</span></div>
        </div>
      </div>
    </div>
  )
}
