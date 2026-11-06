import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Logo } from '../components/Layout'
import { Field, Spinner } from '../components/ui'
import { homePathFor, useAuth } from '../context/AuthContext'
import { errorMessage } from '../api/client'
import { getServerUrl, isNative, requestNotificationPermission } from '../platform'
import ServerSetup from './ServerSetup'

// Seeded demo accounts. Each request is offered to ONE best-matched partner, so the
// list shows every partner by business name: sign in as the one named on the
// customer's tracking screen.
export const DEMO_ACCOUNTS = [
  { label: 'Vehicle owner (Ravi)', email: 'ravi@fuelgo.in', password: 'User@123' },
  { label: 'Admin', email: 'admin@fuelgo.in', password: 'Admin@123' },
]
export const DEMO_PARTNERS = [
  { label: 'Chamundi Fuel Express', kind: 'Fuel', email: 'suresh.fuel@fuelgo.in' },
  { label: 'Mysuru Doorstep Diesel', kind: 'Fuel', email: 'lakshmi.fuel@fuelgo.in' },
  { label: 'GreenGas CNG Mobile', kind: 'Fuel', email: 'arjun.fuel@fuelgo.in' },
  { label: 'Manju Auto Works', kind: 'Mechanic', email: 'manju.mech@fuelgo.in' },
  { label: 'QuickFix Roadside', kind: 'Mechanic', email: 'fathima.mech@fuelgo.in' },
  { label: 'Venky Towing & Repairs', kind: 'Mechanic', email: 'venky.mech@fuelgo.in' },
  { label: 'Devaraja Garage On-Call', kind: 'Mechanic', email: 'naveen.mech@fuelgo.in' },
].map((p) => ({ ...p, password: 'Provider@123' }))

/** Demo login email for a seeded provider business name (null for real partners). */
export function demoEmailFor(businessName) {
  return DEMO_PARTNERS.find((p) => p.label === businessName)?.email || null
}

export function validateLogin({ email, password }) {
  const errors = {}
  if (!email.trim()) errors.email = 'Enter your email'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Enter a valid email'
  if (!password) errors.password = 'Enter your password'
  return errors
}

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState('')
  const [editServer, setEditServer] = useState(false)

  if (user) return <Navigate to={homePathFor(user)} replace />
  // Changing the server reloads the app so every connection uses the new address.
  if (editServer) return <ServerSetup onDone={() => window.location.reload()} onCancel={() => setEditServer(false)} />

  const submit = async (e, creds = form) => {
    e?.preventDefault()
    const errs = validateLogin(creds)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSubmitting(true)
    setServerError('')
    try {
      const u = await login(creds.email.trim(), creds.password)
      requestNotificationPermission()
      toast.success(`Welcome back, ${u.name.split(' ')[0]}`)
      const from = location.state?.from
      navigate(from && from.startsWith(homePathFor(u)) ? from : homePathFor(u), { replace: true })
    } catch (err) {
      setServerError(errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <Logo />
        <div>
          <h1 style={{ fontSize: '2.2rem' }}>Roadside help, on demand.</h1>
          <p>Fuel delivery and mechanics across Mysuru, tracked live from the moment you book.</p>
        </div>
        <p className="small">MCA Semester 3 Project · MPRJ382</p>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <h1>Log in</h1>
          <p className="muted">New here? <Link to="/register">Create an account</Link></p>
          {isNative && (
            <p className="small muted">Server: <code>{getServerUrl()}</code> · <button type="button" className="link-btn" onClick={() => setEditServer(true)}>Change</button></p>
          )}
          {serverError && <div className="alert alert-error" role="alert">{serverError}</div>}
          <form onSubmit={submit} noValidate>
            <Field label="Email" error={errors.email}>
              {(id) => <input id={id} type="email" autoComplete="email" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })} />}
            </Field>
            <Field label="Password" error={errors.password}>
              {(id) => <input id={id} type="password" autoComplete="current-password" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} />}
            </Field>
            <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
              {submitting ? <Spinner size={18} /> : 'Log in'}
            </button>
          </form>
          <div className="card demo-logins" style={{ marginTop: 20 }}>
            <strong>Demo accounts</strong>
            <span className="muted small">Run <code>python seed.py</code> first, then tap to sign in.</span>
            {DEMO_ACCOUNTS.map((a) => (
              <button key={a.email} type="button" className="btn btn-secondary btn-sm" disabled={submitting}
                onClick={() => { setForm(a); submit(null, a) }}>
                {a.label} <span className="muted" style={{ marginLeft: 'auto' }}>{a.email}</span>
              </button>
            ))}
            <strong style={{ marginTop: 8 }}>Partners</strong>
            <span className="muted small">A request goes to the one best-matched partner. Sign in as the partner named on the customer's tracking screen.</span>
            {DEMO_PARTNERS.map((a) => (
              <button key={a.email} type="button" className="btn btn-secondary btn-sm" disabled={submitting}
                onClick={() => { setForm(a); submit(null, a) }}>
                {a.label} <span className="muted" style={{ marginLeft: 'auto' }}>{a.kind}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
