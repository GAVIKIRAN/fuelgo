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

const PROMO = {
  user: { title: 'Stranded on the road?', text: 'Fuel or a mechanic, sent to your spot.', to: '/app/fuel', cta: 'Order fuel' },
  provider: { title: 'Ready for the next job?', text: 'New requests reach you instantly.', to: '/provider/requests', cta: 'View requests' },
  admin: { title: 'Demand forecast', text: 'See where fuel will be needed next.', to: '/admin/ml', cta: 'Open ML insights' },
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { connected } = useSocket()
  const { theme, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const items = NAV[user.role] || []
  const home = items[0]?.to || '/'
  const promo = PROMO[user.role]

  useEffect(() => setMenuOpen(false), [location.pathname])

  const doLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className={`shell role-${user.role}`}>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
        <Logo to={home} />
        <span className="side-label">Menu</span>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
            <Icon name={i.icon} size={19} /> {i.label}
          </NavLink>
        ))}
        <span className="side-label">General</span>
        <button type="button" className="side-link" onClick={toggle}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={19} /> {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button type="button" className="side-link" onClick={doLogout}>
          <Icon name="logout" size={19} /> Log out
        </button>
        {promo && (
          <div className="side-promo">
            <strong>{promo.title}</strong>
            <span>{promo.text}</span>
            <Link to={promo.to} className="btn btn-primary btn-sm">{promo.cta}</Link>
          </div>
        )}
      </aside>

      <div className="shell-main">
        <header className="topbar">
          <div className="topbar-left">
            {user.role === 'admin' && (
              <button className="icon-btn only-mobile" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu" aria-expanded={menuOpen}>
                <Icon name={menuOpen ? 'x' : 'menu'} />
              </button>
            )}
            <span className="only-mobile"><Logo to={home} /></span>
            <span className="live-pill only-desktop">
              <span className={`live-dot ${connected ? 'on' : ''}`} />
              {connected ? 'Live updates on' : 'Reconnecting…'}
            </span>
            {user.role !== 'user' && <span className="role-chip">{user.role === 'admin' ? 'Admin' : 'Partner'}</span>}
          </div>
          <div className="topbar-right">
            <span className={`live-dot only-mobile ${connected ? 'on' : ''}`} title={connected ? 'Live updates connected' : 'Reconnecting…'} />
            <NotificationBell />
            <span className="only-mobile"><ThemeToggle /></span>
            <div className="user-chip only-desktop">
              <span className="avatar">{user.name?.[0]?.toUpperCase()}</span>
              <div>
                <strong>{user.name}</strong>
                {user.email && <small>{user.email}</small>}
              </div>
            </div>
            <button className="icon-btn only-mobile" onClick={doLogout} aria-label="Log out"><Icon name="logout" /></button>
          </div>
        </header>

        <main className="content" id="main">
          <div className="page-anim" key={location.pathname}>
            <Outlet />
          </div>
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
