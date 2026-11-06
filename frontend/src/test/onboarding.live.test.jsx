// @vitest-environment-options {"url": "http://localhost:5173/"}
/**
 * Live tests for the landing page and new-user onboarding (backend must be running).
 *   LIVE_API=http://127.0.0.1:5000 VITE_API_URL=http://127.0.0.1:5000 npx vitest run onboarding
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import App from '../App'
import { AuthProvider } from '../context/AuthContext'
import { ThemeProvider } from '../context/ThemeContext'
import { SocketProvider } from '../context/SocketContext'

const API = process.env.LIVE_API
const run = API ? describe : describe.skip

globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} }
window.scrollTo = () => {}
Object.defineProperty(navigator, 'geolocation', {
  value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 12.31, longitude: 76.64, accuracy: 10 } }), watchPosition: () => 1, clearWatch() {} },
  configurable: true,
})

let currentPath = ''
function PathSpy() {
  currentPath = useLocation().pathname
  return null
}
const renderApp = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <ThemeProvider><AuthProvider><SocketProvider>
      <App />
      <Routes><Route path="*" element={<PathSpy />} /></Routes>
    </SocketProvider></AuthProvider></ThemeProvider>
  </MemoryRouter>,
)
const tag = () => Math.random().toString(36).slice(2, 8)

run('landing page + onboarding (live)', () => {
  it('landing shows live stats, prices, services, FAQ and sign-up CTAs', async () => {
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Help is minutes away')
    await waitFor(() => expect(screen.getByText('rescues completed').previousSibling.textContent).toMatch(/\d/), { timeout: 8000 })
    await waitFor(() => expect(screen.getByText('Petrol').closest('.price-row')).toHaveTextContent(/₹\s?\d+/), { timeout: 8000 })
    expect(screen.getByRole('heading', { name: 'Emergency fuel delivery' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mechanic assistance' })).toBeInTheDocument()
    expect(screen.getByText('Which areas do you cover?')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /Get help now|Create free account/ })[0]).toHaveAttribute('href', '/register')
    expect(screen.getByRole('link', { name: 'Become a partner' })).toHaveAttribute('href', '/register?role=provider')
    await waitFor(() => expect(screen.getByText('What customers say')).toBeInTheDocument(), { timeout: 8000 })
  }, 20000)

  it('a new vehicle owner registers, lands on the welcome checklist and completes it', async () => {
    const user = userEvent.setup()
    renderApp('/register')
    await user.type(screen.getByLabelText('Full name'), 'Welcome Tester')
    await user.type(screen.getByLabelText('Email'), `welcome_${tag()}@test.in`)
    await user.type(screen.getByLabelText('Password'), 'Welcome123')
    await user.type(screen.getByLabelText('Confirm password'), 'Welcome123')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(currentPath).toBe('/app/welcome'), { timeout: 10000 })
    expect(await screen.findByRole('heading', { name: /Welcome to FuelGo, Welcome/ })).toBeInTheDocument()

    // 1. vehicle
    await user.type(screen.getByLabelText('Make'), 'Honda')
    await user.type(screen.getByLabelText('Model'), 'Jazz')
    await user.type(screen.getByLabelText('Registration number'), `KA09W${'ABCDEFGH'[Math.floor(Math.random() * 8)]}${1000 + Math.floor(Math.random() * 8999)}`)
    await user.click(screen.getByRole('button', { name: 'Add vehicle' }))
    await waitFor(() => expect(screen.getByText(/Honda Jazz/)).toBeInTheDocument(), { timeout: 8000 })
    // 2. location
    await user.click(screen.getByRole('button', { name: /Allow location/ }))
    // 3. phone
    await user.type(screen.getByLabelText('Mobile number'), '9845098450')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.getByText(/Providers can call you on 9845098450/)).toBeInTheDocument(), { timeout: 8000 })
    // 4. SOS
    await user.click(screen.getByRole('button', { name: 'Got it' }))
    await waitFor(() => expect(screen.getByText('4 of 4 done')).toBeInTheDocument())
    await user.click(screen.getByRole('link', { name: "I'm ready, go to home" }))
    await waitFor(() => expect(currentPath).toBe('/app'))
  }, 40000)

  it('a new partner registers and lands on the partner checklist', async () => {
    const user = userEvent.setup()
    renderApp('/register?role=provider')
    await user.type(screen.getByLabelText('Full name'), 'Partner Tester')
    await user.type(screen.getByLabelText('Email'), `partner_${tag()}@test.in`)
    await user.type(screen.getByLabelText('Password'), 'Partner123')
    await user.type(screen.getByLabelText('Confirm password'), 'Partner123')
    fireEvent.click(screen.getByRole('radio', { name: /Mechanic/ }))
    await user.type(screen.getByLabelText('Business name'), 'Tester Garage')
    await user.selectOptions(screen.getByLabelText('Service area'), 'Gokulam')
    await user.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(currentPath).toBe('/provider/welcome'), { timeout: 10000 })
    expect(await screen.findByRole('heading', { name: /Welcome aboard, Partner/ })).toBeInTheDocument()
    const verify = screen.getByRole('heading', { name: 'Get verified' }).closest('.check-item')
    expect(within(verify).getByText('PENDING')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Go online/ })).toBeDisabled()
    expect(screen.getByText('1 of 4 done')).toBeInTheDocument() // profile already complete
  }, 30000)
})
