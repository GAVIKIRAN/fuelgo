import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { Field, Loading, Spinner } from '../../components/ui'
import { authApi, vehicleApi } from '../../api'
import { errorMessage, fieldErrors } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { useGeolocation } from '../../hooks/useGeolocation'
import { FUEL_LABELS } from '../../utils/format'
import { validateVehicle } from './Profile'

function Step({ n, done, title, children }) {
  return (
    <div className={`card check-item ${done ? 'done' : ''}`}>
      <span className="check-mark">{done ? <Icon name="check" size={18} strokeWidth={3} /> : n}</span>
      <div className="ci-body">
        <h3 style={{ margin: 0 }}>{title}</h3>
        {children}
      </div>
    </div>
  )
}

function QuickVehicle({ onAdded }) {
  const [form, setForm] = useState({ make: '', model: '', registration_number: '', fuel_type: 'petrol', vehicle_type: 'car' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: k === 'registration_number' ? e.target.value.toUpperCase() : e.target.value })

  const save = async (e) => {
    e.preventDefault()
    const errs = validateVehicle(form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setBusy(true)
    try {
      await vehicleApi.create(form)
      toast.success('Vehicle added')
      onAdded()
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <div className="form-grid">
        <Field label="Make" error={errors.make}>{(id) => <input id={id} value={form.make} onChange={set('make')} placeholder="Maruti Suzuki" />}</Field>
        <Field label="Model" error={errors.model}>{(id) => <input id={id} value={form.model} onChange={set('model')} placeholder="Swift" />}</Field>
        <Field label="Registration number" error={errors.registration_number}>{(id) => <input id={id} value={form.registration_number} onChange={set('registration_number')} placeholder="KA09AB1234" />}</Field>
        <Field label="Fuel type">{(id) => <select id={id} value={form.fuel_type} onChange={set('fuel_type')}>{Object.entries(FUEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</Field>
      </div>
      <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner size={16} /> : 'Add vehicle'}</button>
    </form>
  )
}

export default function Welcome() {
  const { user, setUser } = useAuth()
  const vehicles = useAsync(() => vehicleApi.list(), [])
  const { locate, loading: locating, error: locError, position } = useGeolocation()
  const [locOk, setLocOk] = useState(false)
  const [phone, setPhone] = useState(user.phone || '')
  const [savingPhone, setSavingPhone] = useState(false)
  const [sosSeen, setSosSeen] = useState(() => {
    try { return localStorage.getItem('fuelgo.sosSeen') === '1' } catch { return false }
  })

  useEffect(() => {
    // Already granted? (Permissions API is optional; ignore if unavailable.)
    navigator.permissions?.query({ name: 'geolocation' }).then((p) => p.state === 'granted' && setLocOk(true)).catch(() => {})
  }, [])
  useEffect(() => { if (position) setLocOk(true) }, [position])

  if (vehicles.loading) return <Loading />
  const hasVehicle = (vehicles.data?.items.length || 0) > 0
  const hasPhone = Boolean(user.phone)

  const savePhone = async (e) => {
    e.preventDefault()
    if (!/^\+?[0-9]{10,13}$/.test(phone)) return toast.error('Enter a valid 10-digit mobile number')
    setSavingPhone(true)
    try {
      setUser(await authApi.updateMe({ phone }))
      toast.success('Mobile number saved')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSavingPhone(false)
    }
  }

  const markSos = () => {
    setSosSeen(true)
    try { localStorage.setItem('fuelgo.sosSeen', '1') } catch { /* ignore */ }
  }

  const done = [hasVehicle, locOk, hasPhone, sosSeen].filter(Boolean).length
  return (
    <div className="stack" style={{ maxWidth: 820, margin: '0 auto' }}>
      <div className="onboard-hero">
        <h1 style={{ color: '#fff' }}>Welcome to FuelGo, {user.name.split(' ')[0]}</h1>
        <p>A couple of minutes now means help arrives faster when you're stuck. Finish these steps and you're ready.</p>
        <div className="progress" aria-label={`${done} of 4 steps done`}><span style={{ width: `${(done / 4) * 100}%` }} /></div>
        <p className="small" style={{ marginTop: 8 }}>{done} of 4 done</p>
      </div>

      <div className="checklist">
        <Step n={1} done={hasVehicle} title="Add your vehicle">
          {hasVehicle ? (
            <p className="muted">{vehicles.data.items.map((v) => `${v.make} ${v.model} (${v.registration_number})`).join(', ')}. You can add more in <Link to="/app/profile">Profile</Link>.</p>
          ) : (
            <>
              <p className="muted">We pre-select the right fuel and tell the provider what to expect.</p>
              <QuickVehicle onAdded={() => vehicles.reload({ silent: true })} />
            </>
          )}
        </Step>

        <Step n={2} done={locOk} title="Allow location access">
          <p className="muted">FuelGo uses your location only when you request help, to find the nearest provider.</p>
          {!locOk && (
            <button className="btn btn-secondary btn-sm" onClick={locate} disabled={locating}>
              {locating ? <Spinner size={14} /> : <Icon name="crosshair" size={16} />} Allow location
            </button>
          )}
          {locError && <div className="alert alert-warn" style={{ marginTop: 10 }}>{locError} You can still drag a pin on the map when you request help.</div>}
        </Step>

        <Step n={3} done={hasPhone} title="Add a mobile number">
          {hasPhone ? <p className="muted">Providers can call you on {user.phone}.</p> : (
            <form onSubmit={savePhone} className="row" style={{ alignItems: 'flex-start' }}>
              <p className="muted" style={{ width: '100%' }}>So your provider can call if they can't find you.</p>
              <input className="input" style={{ maxWidth: 240 }} inputMode="tel" placeholder="98450 12345" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\s/g, ''))} aria-label="Mobile number" />
              <button className="btn btn-primary" disabled={savingPhone}>{savingPhone ? <Spinner size={16} /> : 'Save'}</button>
            </form>
          )}
        </Step>

        <Step n={4} done={sosSeen} title="Know your SOS button">
          <p className="muted">In an emergency, open FuelGo and tap the big <strong>SOS</strong> button on the home screen. Choose “out of fuel” or “broke down” and we send the nearest verified provider automatically. If you already have a request, SOS takes you straight to it.</p>
          {!sosSeen && <button className="btn btn-secondary btn-sm" onClick={markSos}>Got it</button>}
        </Step>
      </div>

      <div className="btn-row">
        <Link to="/app" className="btn btn-primary btn-lg">{done === 4 ? "I'm ready, go to home" : 'Skip for now'}</Link>
        <Link to="/app/fuel" className="btn btn-ghost">Order fuel</Link>
        <Link to="/app/mechanic" className="btn btn-ghost">Get a mechanic</Link>
      </div>
    </div>
  )
}
