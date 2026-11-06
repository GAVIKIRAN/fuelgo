// @vitest-environment-options {"url": "http://localhost:5173/"}
/**
 * Live regression test for the booking + vehicle forms against a running, seeded backend.
 *   LIVE_API=http://127.0.0.1:5000 VITE_API_URL=http://127.0.0.1:5000 npx vitest run booking
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition: (_s, e) => e({ code: 1 }), watchPosition: () => 1, clearWatch() {} }, configurable: true })

let currentPath = ''
function PathSpy() {
  currentPath = useLocation().pathname
  return null
}

async function newUser() {
  const tag = Math.random().toString(36).slice(2, 8)
  const res = await fetch(`${API}/api/v1/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Live Tester', email: `live_${tag}@test.in`, password: 'LivePass123' }),
  })
  const data = await res.json()
  localStorage.setItem('fuelgo.tokens', JSON.stringify({ access_token: data.access_token, refresh_token: data.refresh_token }))
  return data.access_token
}

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider><AuthProvider><SocketProvider>
        <App />
        <Routes><Route path="*" element={<PathSpy />} /></Routes>
      </SocketProvider></AuthProvider></ThemeProvider>
    </MemoryRouter>,
  )
}

run('live booking + vehicle form', () => {
  it('books fuel from the provider selection screen', async () => {
    const token = await newUser()
    sessionStorage.setItem('fuelgo.draft', JSON.stringify({
      kind: 'fuel', summary: 'Petrol · 5 L',
      payload: { service_type: 'fuel', fuel_type: 'petrol', quantity_litres: 5, lat: 12.3052, lng: 76.6552, vehicle_id: null },
    }))
    renderApp('/app/select-provider')
    const cards = await screen.findAllByRole('radio', {}, { timeout: 8000 })
    fireEvent.click(cards[0])
    fireEvent.click(screen.getByRole('button', { name: /^Book / }))
    await waitFor(() => expect(currentPath).toMatch(/^\/app\/requests\/\d+$/), { timeout: 8000 })
    const active = await (await fetch(`${API}/api/v1/requests/active`, { headers: { Authorization: `Bearer ${token}` } })).json()
    expect(active.request?.status).toBe('PENDING')
    await fetch(`${API}/api/v1/requests/${active.request.id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
  }, 30000)

  it('books fuel from the fuel form with auto-assign', async () => {
    const token = await newUser()
    renderApp('/app/fuel')
    const auto = await screen.findByRole('button', { name: 'Auto-assign nearest' }, { timeout: 8000 })
    await waitFor(() => expect(auto).toBeEnabled(), { timeout: 8000 })
    await new Promise((r) => setTimeout(r, 600)) // let the debounced estimate land
    fireEvent.click(auto)
    await waitFor(() => expect(currentPath).toMatch(/^\/app\/requests\/\d+$/), { timeout: 8000 })
    const active = await (await fetch(`${API}/api/v1/requests/active`, { headers: { Authorization: `Bearer ${token}` } })).json()
    expect(active.request?.service_type).toBe('fuel')
    await fetch(`${API}/api/v1/requests/${active.request.id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
  }, 30000)

  it('SOS: chooser → emergency fuel → booked; then SOS links to the active request', async () => {
    const token = await newUser()
    const view = renderApp('/app')
    fireEvent.click(await screen.findByRole('button', { name: 'Request emergency help' }, { timeout: 8000 }))
    fireEvent.click(await screen.findByRole('button', { name: /I ran out of fuel/ }))
    await waitFor(() => expect(currentPath).toBe('/app/fuel'))
    const send = await screen.findByRole('button', { name: /Send nearest provider now/ }, { timeout: 8000 })
    await waitFor(() => expect(send).toBeEnabled(), { timeout: 8000 })
    await new Promise((r) => setTimeout(r, 600))
    fireEvent.click(send)
    await waitFor(() => expect(currentPath).toMatch(/^\/app\/requests\/\d+$/), { timeout: 8000 })
    const id = currentPath.split('/').pop()
    view.unmount()

    renderApp('/app')
    const track = await screen.findByRole('button', { name: new RegExp(`active request #${id}`) }, { timeout: 8000 })
    fireEvent.click(track)
    await waitFor(() => expect(currentPath).toBe(`/app/requests/${id}`))
    await fetch(`${API}/api/v1/requests/${id}/cancel`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: '{}' })
  }, 40000)

  it('adds a vehicle by typing into the modal form', async () => {
    const token = await newUser()
    const user = userEvent.setup()
    renderApp('/app/profile')
    await user.click(await screen.findByRole('button', { name: /Add vehicle/ }, { timeout: 8000 }))
    await user.type(screen.getByLabelText('Make'), 'Tata')
    await user.type(screen.getByLabelText('Model'), 'Nexon')
    await user.type(screen.getByLabelText('Registration number'), 'KA09QQ4321')
    expect(screen.getByLabelText('Make')).toHaveValue('Tata')
    expect(screen.getByLabelText('Model')).toHaveValue('Nexon')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(async () => {
      const list = await (await fetch(`${API}/api/v1/vehicles`, { headers: { Authorization: `Bearer ${token}` } })).json()
      expect(list.items.map((v) => v.registration_number)).toContain('KA09QQ4321')
    }, { timeout: 8000 })
    // clean up so the test can be re-run
    const list = await (await fetch(`${API}/api/v1/vehicles`, { headers: { Authorization: `Bearer ${token}` } })).json()
    for (const v of list.items) await fetch(`${API}/api/v1/vehicles/${v.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
  }, 30000)
})
