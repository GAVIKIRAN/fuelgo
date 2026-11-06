import { Link, Navigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { Logo, ThemeToggle } from '../components/Layout'
import { homePathFor, useAuth } from '../context/AuthContext'

const FEATURES = [
  { icon: 'fuel', title: 'Fuel at your location', text: 'Petrol, diesel or CNG delivered to the spot your vehicle stopped. See the full price before you book.' },
  { icon: 'wrench', title: 'Roadside mechanics', text: 'Flat tyre, dead battery, engine trouble or towing. Nearby verified mechanics come to you.' },
  { icon: 'navigation', title: 'Live tracking', text: 'Watch your provider drive to you on the map with a live ETA. No more guessing.' },
  { icon: 'shield', title: 'Verified partners', text: 'Every provider is document-checked by our team before they can take a job.' },
  { icon: 'card', title: 'Pay your way', text: 'UPI, card or cash on delivery, with an instant digital receipt.' },
  { icon: 'chart', title: 'Smart dispatch', text: 'Demand forecasting places fuel agents where they will be needed next.' },
]

export default function Landing() {
  const { user } = useAuth()
  if (user) return <Navigate to={homePathFor(user)} replace />
  return (
    <div className="landing">
      <nav className="landing-nav">
        <Logo />
        <div className="row">
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/register" className="btn btn-primary">Sign up</Link>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-inner">
          <div>
            <h1>Out of fuel or broken down? <em>Help is minutes away.</em></h1>
            <p>FuelGo brings emergency fuel delivery and mechanic assistance to you anywhere in Mysuru, from verified local providers you can track live.</p>
            <div className="btn-row" style={{ marginTop: 24 }}>
              <Link to="/register" className="btn btn-primary btn-lg"><Icon name="alert" /> Get help now</Link>
              <Link to="/register?role=provider" className="btn btn-secondary btn-lg">Become a partner</Link>
            </div>
          </div>
          <div className="hero-panel">
            <h3>How it works</h3>
            {[
              ['Share your location', 'GPS or drop a pin on the map.'],
              ['Pick a provider', 'Ranked by distance, rating and ETA, with the price up front.'],
              ['Track them live', 'Follow your provider on the map with a live ETA.'],
              ['Pay and rate', 'UPI, card or cash, then rate the service.'],
            ].map(([t, s], i) => (
              <div className="hero-step" key={t}>
                <b>{i + 1}</b>
                <div><strong>{t}</strong><span>{s}</span></div>
              </div>
            ))}
          </div>
        </div>
      </header>

      <section className="section">
        <h2 style={{ marginBottom: 20 }}>Fuel and repairs in one app</h2>
        <div className="grid grid-3">
          {FEATURES.map((f) => (
            <div className="card feature" key={f.title}>
              <div className="feature-icon"><Icon name={f.icon} size={22} /></div>
              <h3>{f.title}</h3>
              <p className="muted" style={{ margin: 0 }}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">FuelGo · Integrated Fuel Delivery and Mechanic Service Platform · Mysuru, Karnataka</footer>
    </div>
  )
}
