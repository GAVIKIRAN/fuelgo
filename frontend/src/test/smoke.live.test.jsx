// @vitest-environment-options {"url": "http://localhost:5173/"}
/**
 * Live smoke test: renders every page for every role against a running, seeded backend.
 * Opt-in (skipped by default):
 *
 *   # backend: python seed.py && flask run
 *   LIVE_API=http://127.0.0.1:5000 VITE_API_URL=http://127.0.0.1:5000 npx vitest run smoke
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { SocketProvider } from '../context/SocketContext'

const API = process.env.LIVE_API
const run = API ? describe : describe.skip

// jsdom lacks these browser APIs used by charts/maps
globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }))
window.scrollTo = () => {}
Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_s, e) => e({ code: 1 }), watchPosition: () => 1, clearWatch() {} }, configurable: true })

async function login(email, password) {
  const res = await fetch(`${API}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
  const data = await res.json()
  localStorage.setItem('fuelgo.tokens', JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token }))
  return data
}

async function renderAt(path) {
  const errors = []
  const spy = vi.spyOn(console, 'error').mockImplementation((...a) => errors.push(a.join(' ')))
  const view = render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider><AuthProvider><SocketProvider><App /></SocketProvider></AuthProvider></ThemeProvider>
    </MemoryRouter>,
  )
  await waitFor(() => {
    expect(screen.queryByText(/Checking your session|^Loading/)).not.toBeInTheDocument()
  }, { timeout: 8000 })
  await new Promise((r) => setTimeout(r, 400))
  spy.mockRestore()
  const failed = screen.queryByText("Couldn't load this") || screen.queryByRole('heading', { name: 'Log in' })
  if (process.env.SMOKE_VERBOSE) console.log(path, '->', document.querySelector('h1')?.textContent)
  const reactErrors = errors.filter((e) => /Uncaught|above error|is not a function|Cannot read prop|not defined/.test(e))
  view.unmount()
  return { failed: Boolean(failed), reactErrors }
}

run('live smoke: every page renders with real data', () => {
  const pages = {
    user: ['ravi@fuelgo.in', 'User@123', ['/app', '/app/fuel', '/app/mechanic', '/app/history', '/app/profile', '/app/requests/:id', '/app/requests/:id/pay', '/app/requests/:id/rate']],
    provider: ['suresh.fuel@fuelgo.in', 'Provider@123', ['/provider', '/provider/requests', '/provider/job', '/provider/earnings', '/provider/profile']],
    admin: ['admin@fuelgo.in', 'Admin@123', ['/admin', '/admin/users', '/admin/providers', '/admin/requests', '/admin/payments', '/admin/feedback', '/admin/pricing', '/admin/ml']],
  }
  for (const [role, [email, password, paths]] of Object.entries(pages)) {
    it(`${role} pages`, async () => {
      const { access_token } = await login(email, password)
      let reqId = ''
      if (role === 'user') {
        const res = await fetch(`${API}/api/v1/requests?status=COMPLETED&per_page=1`, { headers: { Authorization: `Bearer ${access_token}` } })
        reqId = (await res.json()).items[0]?.id
      }
      const problems = []
      for (const p of paths) {
        const path = p.replace(':id', reqId)
        const { failed, reactErrors } = await renderAt(path)
        if (failed || reactErrors.length) problems.push(`${path}: ${failed ? 'error state' : ''} ${reactErrors.join(' | ').slice(0, 300)}`)
      }
      expect(problems).toEqual([])
    }, 120000)
  }
})
