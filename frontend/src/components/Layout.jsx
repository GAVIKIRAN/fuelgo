import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import NotificationBell from './NotificationBell'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useSocket } from '../context/SocketContext'

const NAV = {
  user: [
    { to: '/app', label: 'Home', icon: 'home', end: true },
    { to: '/app/fuel', label: 'Fuel', icon: 'fuel' },
    { to: '/app/mechanic', label: 'Mechanic', icon: 'wrench' },
    { to: '/app/history', label: 'History', icon: 'history' },
    { to: '/app/profile', label: 'Profile', icon: 'user' },
  ],
  provider: [
    { to: '/provider', label: 'Dashboard', icon: 'home', end: true },
    { to: '/provider/requests', label: 'Requests', icon: 'list' },
    { to: '/provider/job', label: 'Active job', icon: 'navigation' },
    { to: '/provider/earnings', label: 'Earnings', icon: 'wallet' },
    { to: '/provider/profile', label: 'Profile', icon: 'user' },
  ],
  admin: [
    { to: '/admin', label: 'Dashboard', icon: 'chart', end: true },
    { to: '/admin/requests', label: 'Requests', icon: 'list' },
    { to: '/admin/providers', label: 'Providers', icon: 'shield' },
    { to: '/admin/users', label: 'Users', icon: 'users' },
    { to: '/admin/payments', label: 'Payments', icon: 'card' },
    { to: '/admin/feedback', label: 'Feedback', icon: 'message' },
    { to: '/admin/pricing', label: 'Pricing', icon: 'tag' },
    { to: '/admin/ml', label: 'ML insights', icon: 'brain' },
  ],
}

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label="FuelGo home">
      <span className="logo-mark"><Icon name="fuel" size={18} strokeWidth={2.4} /></span>
      <span className="logo-text">Fuel<span>Go</span></span>
    </Link>
  )
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { connected } = useSocket()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const items = NAV[user.role] || []
  const home = items[0]?.to || '/'

  useEffect(() => setMenuOpen(false), [location.pathname])

  const doLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className={`shell role-${user.role}`}>
      <header className="topbar">
        <div className="topbar-left">
          {user.role === 'admin' && (
            <button className="icon-btn only-mobile" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
              <Icon name="menu" />
            </button>
          )}
          <Logo to={home} />
          {user.role !== 'user' && <span className="role-chip">{user.role === 'admin' ? 'Admin' : 'Partner'}</span>}
        </div>
        <nav className="topnav only-desktop" aria-label="Main">
          {user.role !== 'admin' && items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>{i.label}</NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <span className={`live-dot ${connected ? 'on' : ''}`} title={connected ? 'Live updates connected' : 'Reconnecting…'} />
          <NotificationBell />
          <ThemeToggle />
          <div className="user-chip only-desktop">
            <span className="avatar">{user.name?.[0]?.toUpperCase()}</span>
            <span>{user.name.split(' ')[0]}</span>
          </div>
          <button className="icon-btn" onClick={doLogout} aria-label="Log out"><Icon name="logout" /></button>
        </div>
      </header>

      <div className="shell-body">
        {user.role === 'admin' && (
          <aside className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Admin navigation">
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end}>
                <Icon name={i.icon} size={18} /> {i.label}
              </NavLink>
            ))}
          </aside>
        )}
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>

      {user.role !== 'admin' && (
        <nav className="bottomnav only-mobile" aria-label="Main">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end}>
              <Icon name={i.icon} size={22} />
              <span>{i.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}
