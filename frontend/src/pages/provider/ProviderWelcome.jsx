import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { getPosition } from '../../platform'
import { Badge, Loading, Spinner } from '../../components/ui'
import { providerApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'

function Step({ n, done, title, children }) {
  return (
    <div className={`card check-item ${done ? 'done' : ''}`}>
      <span className="check-mark">{done ? <Icon name="check" size={18} strokeWidth={3} /> : n}</span>
      <div className="ci-body"><h3 style={{ margin: 0 }}>{title}</h3>{children}</div>
    </div>
  )
}

function position() {
  return getPosition({ timeout: 8000 }).catch(() => ({}))
}

export default function ProviderWelcome() {
  const { user } = useAuth()
  const profile = useAsync(() => providerApi.profile(), [])
  const [busy, setBusy] = useState(false)

  if (profile.loading || !profile.data) return <Loading />
  const p = profile.data
  const steps = {
    profile: Boolean(p.zone && p.business_name),
    docs: p.documents.length > 0,
    verified: p.is_verified,
    online: p.is_available,
  }
  const done = Object.values(steps).filter(Boolean).length

  const goOnline = async () => {
    setBusy(true)
    try {
      profile.setData({ ...p, ...(await providerApi.availability({ is_available: true, ...(await position()) })) })
      toast.success('You are online')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="onboard-hero">
        <h1 style={{ color: '#fff' }}>Welcome aboard, {user.name.split(' ')[0]}</h1>
        <p>Four steps to your first {p.provider_type === 'fuel' ? 'fuel delivery' : 'roadside job'} with FuelGo.</p>
        <div className="progress" aria-label={`${done} of 4 steps done`}><span style={{ width: `${(done / 4) * 100}%` }} /></div>
        <p className="small" style={{ marginTop: 8 }}>{done} of 4 done</p>
      </div>
      <div className="checklist">
        <Step n={1} done={steps.profile} title="Complete your business profile">
          <p className="muted">{steps.profile ? `${p.business_name} · ${p.zone} · ${p.service_radius_km} km radius` : 'Set your service area and radius so we only send you nearby jobs.'}</p>
          {!steps.profile && <Link to="/provider/profile" className="btn btn-secondary btn-sm">Edit profile</Link>}
        </Step>
        <Step n={2} done={steps.docs} title="Upload your documents">
          <p className="muted">
            {p.provider_type === 'fuel' ? 'Driving licence, vehicle RC and fuel transport permit (PESO).' : 'Driving licence, ID proof and trade certificate if you have one.'}
            {steps.docs && ` ${p.documents.length} uploaded.`}
          </p>
          <Link to="/provider/profile" className="btn btn-secondary btn-sm"><Icon name="upload" size={16} /> {steps.docs ? 'Manage documents' : 'Upload documents'}</Link>
        </Step>
        <Step n={3} done={steps.verified} title="Get verified">
          <p className="muted">
            Our team reviews your documents, usually within a day. You'll get a notification when it's done.{' '}
            <Badge tone={p.is_verified ? 'green' : p.verification_status === 'PENDING' ? 'amber' : 'red'}>{p.verification_status}</Badge>
          </p>
          {p.verification_note && <div className="alert alert-warn">{p.verification_note}</div>}
          <button className="btn btn-ghost btn-sm" onClick={() => profile.reload({ silent: true })}><Icon name="refresh" size={14} /> Check status</button>
        </Step>
        <Step n={4} done={steps.online} title="Go online and take jobs">
          <p className="muted">When you're online, nearby customers are matched to you by distance, rating and ETA. Accept quickly. If you decline, the job moves to the next partner. Share your live location while driving so the customer can track you.</p>
          {!steps.online && (
            <button className="btn btn-success btn-sm" disabled={!steps.verified || busy} onClick={goOnline}>
              {busy ? <Spinner size={14} /> : <><Icon name="power" size={16} /> Go online</>}
            </button>
          )}
          {!steps.verified && <p className="muted small" style={{ margin: '6px 0 0' }}>Available after verification.</p>}
        </Step>
      </div>
      <div className="btn-row">
        <Link to="/provider" className="btn btn-primary btn-lg">Go to dashboard</Link>
      </div>
    </div>
  )
}
