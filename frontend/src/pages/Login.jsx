import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Logo } from '../components/Layout'
import { Field, Spinner } from '../components/ui'
import { homePathFor, useAuth } from '../context/AuthContext'
import { errorMessage } from '../api/client'

export const DEMO_ACCOUNTS = [
  { label: 'Vehicle owner', email: 'ravi@fuelgo.in', password: 'User@123' },
  { label: 'Fuel partner', email: 'suresh.fuel@fuelgo.in', password: 'Provider@123' },
  { label: 'Mechanic partner', email: 'manju.mech@fuelgo.in', password: 'Provider@123' },
  { label: 'Admin', email: 'admin@fuelgo.in', password: 'Admin@123' },
]

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

  if (user) return <Navigate to={homePathFor(user)} replace />

  const submit = async (e, creds = form) => {
    e?.preventDefault()
    const errs = validateLogin(creds)
    setErrors(errs)
    if (Object.keys(errs).length) return
    setSubmitting(true)
    setServerError('')
    try {
      const u = await login(creds.email.trim(), creds.password)
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
          </div>
        </div>
      </main>
    </div>
  )
}
