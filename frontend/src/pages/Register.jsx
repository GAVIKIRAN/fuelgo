import { useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Logo } from '../components/Layout'
import { Field, Segmented, Spinner } from '../components/ui'
import { homePathFor, useAuth } from '../context/AuthContext'
import { errorMessage, fieldErrors } from '../api/client'
import { requestNotificationPermission } from '../platform'

const ZONES = ['Vijayanagar', 'Kuvempunagar', 'Gokulam', 'Jayalakshmipuram', 'Nazarbad', 'Saraswathipuram',
  'Hebbal', 'Bannimantap', 'Chamundipuram', 'Devaraja Mohalla']

export function validateRegister(f) {
  const e = {}
  if (f.name.trim().length < 2) e.name = 'Enter your full name'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Enter a valid email'
  if (f.phone && !/^\+?[0-9]{10,13}$/.test(f.phone)) e.phone = 'Enter a 10-digit mobile number'
  if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'At least 8 characters with letters and numbers'
  if (f.password !== f.confirm) e.confirm = 'Passwords do not match'
  if (f.role === 'provider') {
    if (f.business_name.trim().length < 2) e.business_name = 'Enter your business name'
    if (!f.zone) e.zone = 'Choose your service area'
    if (f.provider_type === 'fuel' && f.fuel_types.length === 0) e.fuel_types = 'Pick at least one fuel'
  }
  return e
}

export default function Register() {
  const { user, register } = useAuth()
  // Where to go once signed in. Set just before registering so the redirect below
  // sends brand-new accounts to onboarding (instead of racing a navigate() call).
  const afterSignup = useRef(null)
  const [params] = useSearchParams()
  const [form, setForm] = useState({
    role: params.get('role') === 'provider' ? 'provider' : 'user',
    name: '', email: '', phone: '', password: '', confirm: '',
    provider_type: 'fuel', business_name: '', zone: '', service_radius_km: 10,
    vehicle_info: '', tools_info: '', fuel_types: ['petrol', 'diesel'],
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')

  if (user) return <Navigate to={afterSignup.current || homePathFor(user)} replace />
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const toggleFuel = (ft) => setForm({ ...form, fuel_types: form.fuel_types.includes(ft) ? form.fuel_types.filter((x) => x !== ft) : [...form.fuel_types, ft] })

  const submit = async (e) => {
    e.preventDefault()
    const errs = validateRegister(form)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSubmitting(true)
    setServerError('')
    const payload = { name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role }
    if (form.phone) payload.phone = form.phone
    if (form.role === 'provider') {
      Object.assign(payload, {
        provider_type: form.provider_type, business_name: form.business_name.trim(), zone: form.zone,
        service_radius_km: Number(form.service_radius_km), vehicle_info: form.vehicle_info || undefined,
        tools_info: form.tools_info || undefined,
        fuel_types: form.provider_type === 'fuel' ? form.fuel_types : undefined,
      })
    }
    try {
      afterSignup.current = form.role === 'provider' ? '/provider/welcome' : '/app/welcome'
      await register(payload)
      requestNotificationPermission()
      toast.success('Account created')
    } catch (err) {
      afterSignup.current = null
      setErrors(fieldErrors(err))
      setServerError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const isProvider = form.role === 'provider'
  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Logo />
        <div>
          <h1 style={{ fontSize: '2.2rem' }}>{isProvider ? 'Earn with FuelGo.' : 'Never get stranded again.'}</h1>
          <p>{isProvider ? 'Join as a fuel delivery agent or mechanic. Get verified, go online, and take nearby jobs.' : 'Save your vehicles once, then get fuel or a mechanic in a couple of taps.'}</p>
        </div>
        <p className="small">Already have an account? <Link to="/login" style={{ color: '#E68232' }}>Log in</Link></p>
      </aside>
      <main className="auth-main">
        <div className="auth-card" style={{ maxWidth: 520 }}>
          <h1>Create account</h1>
          <p className="muted">Have an account? <Link to="/login">Log in</Link></p>
          {serverError && <div className="alert alert-error" role="alert">{serverError}</div>}
          <form onSubmit={submit} noValidate>
            <Field label="I am a">
              <Segmented name="Account type" value={form.role} onChange={(role) => setForm({ ...form, role })}
                options={[{ value: 'user', label: 'Vehicle owner', icon: 'car' }, { value: 'provider', label: 'Service partner', icon: 'wrench' }]} />
            </Field>
            <div className="form-grid">
              <Field label="Full name" error={errors.name}>{(id) => <input id={id} value={form.name} onChange={set('name')} autoComplete="name" />}</Field>
              <Field label="Mobile number" error={errors.phone}>{(id) => <input id={id} value={form.phone} onChange={set('phone')} inputMode="tel" placeholder="98450 12345" />}</Field>
            </div>
            <Field label="Email" error={errors.email}>{(id) => <input id={id} type="email" value={form.email} onChange={set('email')} autoComplete="email" />}</Field>
            <div className="form-grid">
              <Field label="Password" error={errors.password}>{(id) => <input id={id} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />}</Field>
              <Field label="Confirm password" error={errors.confirm}>{(id) => <input id={id} type="password" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />}</Field>
            </div>

            {isProvider && (
              <>
                <hr className="divider" />
                <Field label="Service type">
                  <Segmented name="Service type" value={form.provider_type} onChange={(provider_type) => setForm({ ...form, provider_type })}
                    options={[{ value: 'fuel', label: 'Fuel delivery', icon: 'fuel' }, { value: 'mechanic', label: 'Mechanic', icon: 'wrench' }]} />
                </Field>
                <Field label="Business name" error={errors.business_name}>{(id) => <input id={id} value={form.business_name} onChange={set('business_name')} />}</Field>
                <div className="form-grid">
                  <Field label="Service area" error={errors.zone}>
                    {(id) => (
                      <select id={id} value={form.zone} onChange={set('zone')}>
                        <option value="">Choose area</option>
                        {ZONES.map((z) => <option key={z}>{z}</option>)}
                      </select>
                    )}
                  </Field>
                  <Field label="Service radius (km)">{(id) => <input id={id} type="number" min={1} max={50} value={form.service_radius_km} onChange={set('service_radius_km')} />}</Field>
                </div>
                {form.provider_type === 'fuel' && (
                  <Field label="Fuels you carry" error={errors.fuel_types}>
                    <div className="chips">
                      {['petrol', 'diesel', 'cng'].map((ft) => (
                        <button type="button" key={ft} className={`chip ${form.fuel_types.includes(ft) ? 'active' : ''}`} onClick={() => toggleFuel(ft)}>{ft.toUpperCase()}</button>
                      ))}
                    </div>
                  </Field>
                )}
                <Field label="Vehicle details" hint="e.g. Tata Ace with 150 L certified tank">{(id) => <input id={id} value={form.vehicle_info} onChange={set('vehicle_info')} />}</Field>
                <Field label="Tools / equipment">{(id) => <input id={id} value={form.tools_info} onChange={set('tools_info')} />}</Field>
                <div className="alert alert-info">After signing up, upload your documents. An admin verifies your account before you can go online.</div>
              </>
            )}
            <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
              {submitting ? <Spinner size={18} /> : 'Create account'}
            </button>
          </form>
        </div>
      </main>
    </div>
  )
}
