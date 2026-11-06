import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Login, { validateLogin } from '../pages/Login'
import { validateRegister } from '../pages/Register'
import { validateVehicle } from '../pages/user/Profile'
import ProtectedRoute from '../components/ProtectedRoute'
import { AuthProvider } from '../context/AuthContext'

describe('validators', () => {
  it('validates login', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({ email: 'Enter your email', password: 'Enter your password' })
    expect(validateLogin({ email: 'bad', password: 'x' }).email).toBe('Enter a valid email')
    expect(validateLogin({ email: 'a@b.in', password: 'x' })).toEqual({})
  })

  it('validates registration, including provider fields', () => {
    const base = {
      name: 'Ravi', email: 'ravi@x.in', phone: '', password: 'Secret123', confirm: 'Secret123', role: 'user',
      business_name: '', zone: '', provider_type: 'fuel', fuel_types: ['petrol'],
    }
    expect(validateRegister(base)).toEqual({})
    expect(validateRegister({ ...base, password: 'short', confirm: 'other' }))
      .toMatchObject({ password: expect.any(String), confirm: 'Passwords do not match' })
    const prov = validateRegister({ ...base, role: 'provider', fuel_types: [] })
    expect(Object.keys(prov)).toEqual(expect.arrayContaining(['business_name', 'zone', 'fuel_types']))
  })

  it('validates vehicle registration numbers', () => {
    const v = { make: 'Honda', model: 'City', registration_number: 'KA09AB1234' }
    expect(validateVehicle(v)).toEqual({})
    expect(validateVehicle({ ...v, registration_number: '1234' }).registration_number).toBeTruthy()
    expect(validateVehicle({ ...v, registration_number: 'ka 09 ab 1234' })).toEqual({})
  })
})

const renderLogin = () => render(<MemoryRouter><AuthProvider><Login /></AuthProvider></MemoryRouter>)

describe('Login page', () => {
  it('shows field errors when submitted empty', () => {
    renderLogin()
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(screen.getByText('Enter your email')).toBeInTheDocument()
    expect(screen.getByText('Enter your password')).toBeInTheDocument()
  })

  it('lists demo accounts', () => {
    renderLogin()
    expect(screen.getByText('admin@fuelgo.in')).toBeInTheDocument()
  })
})

describe('ProtectedRoute', () => {
  it('redirects anonymous visitors to login', () => {
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider>
          <Routes>
            <Route element={<ProtectedRoute roles={['admin']} />}>
              <Route path="/admin" element={<p>secret admin</p>} />
            </Route>
            <Route path="/login" element={<p>login screen</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText('secret admin')).not.toBeInTheDocument()
    expect(screen.getByText('login screen')).toBeInTheDocument()
  })
})
