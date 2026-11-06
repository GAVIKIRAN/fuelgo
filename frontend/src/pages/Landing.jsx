import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { Logo, ThemeToggle } from '../components/Layout'
import { StarRating } from '../components/ui'
import { metaApi } from '../api'
import api from '../api/client'
import { homePathFor, useAuth } from '../context/AuthContext'
import { FUEL_LABELS, PROBLEM_LABELS, money } from '../utils/format'

const STEPS = [
  { icon: 'crosshair', title: 'Share your location', text: 'One tap uses your phone GPS. You can also drop a pin or type a landmark.' },
  { icon: 'list', title: 'Pick a provider', text: 'Verified partners nearby, ranked by distance, rating and ETA, with the price shown up front.' },
  { icon: 'navigation', title: 'Track them live', text: 'Watch your provider move on the map with a live ETA and status updates.' },
  { icon: 'card', title: 'Pay and rate', text: 'UPI, card or cash on delivery, with an instant digital receipt.' },
]

const FEATURES = [
  { icon: 'shield', title: 'Verified partners only', text: 'Every fuel agent and mechanic is document-checked by our team before they can take a job.' },
  { icon: 'tag', title: 'No surprise pricing', text: 'You see fuel cost, delivery fee and distance charge before booking. The final bill matches the estimate unless extra parts are needed.' },
  { icon: 'refresh', title: 'Never left waiting', text: 'If a partner declines, your request goes straight to the next nearest one, automatically.' },
  { icon: 'bell', title: 'Updates at every step', text: 'In-app notifications when your request is accepted, when the partner is on the way, and when they arrive.' },
  { icon: 'history', title: 'Everything in one place', text: 'Vehicles, past services, receipts and complaints are always one tap away.' },
  { icon: 'chart', title: 'Ready where you need it', text: 'Demand forecasting places fuel agents in busy areas before the rush.' },
]

const FAQ = [
  ['Which areas do you cover?', 'FuelGo currently serves Mysuru city: Vijayanagar, Kuvempunagar, Gokulam, Jayalakshmipuram, Nazarbad, Saraswathipuram, Hebbal, Bannimantap, Chamundipuram and Devaraja Mohalla.'],
  ['How much fuel can I order?', 'From 1 to 60 litres of petrol, diesel or CNG per delivery. That is enough to get you to the nearest fuel station or home.'],
  ['What if my phone location is off?', "No problem. Drag the pin on the map to where you are, or type a landmark. We'll still find the nearest provider."],
  ['How do I pay?', 'After the job is done you can pay by UPI, debit/credit card, or cash to the provider. You get a receipt with a transaction ID either way.'],
  ['What if something goes wrong?', 'Rate the service and raise a complaint from the app. Our support team reviews every complaint and replies with a resolution.'],
  ['I own a tow truck / fuel bowser. Can I join?', "Yes. Sign up as a partner, upload your licence, RC and permits, and start taking jobs once we've verified you."],
]

function usePublicData() {
  const [stats, setStats] = useState(null)
  const [pricing, setPricing] = useState(null)
  useEffect(() => {
    api.get('/stats/public').then((r) => setStats(r.data)).catch(() => {})
    metaApi.pricing().then(setPricing).catch(() => {})
  }, [])
  return { stats, pricing }
}

function TrackingPreview() {
  // A static, illustrative tracking card (no live data).
  return (
    <div className="preview-card" aria-hidden="true">
      <div className="preview-map">
        <svg viewBox="0 0 320 170" className="preview-svg">
          <path d="M0 120 C60 110 90 60 160 70 S260 30 320 40" className="pv-road" />
          <path d="M0 40 C80 60 120 140 200 130 S300 150 320 160" className="pv-road thin" />
          <path d="M70 108 C110 90 130 72 160 70 S228 58 250 50" className="pv-route" />
          <circle cx="70" cy="108" r="9" className="pv-provider" />
          <circle cx="250" cy="50" r="9" className="pv-you" />
        </svg>
        <span className="pv-tag pv-tag-provider">Chamundi Fuel Express</span>
        <span className="pv-tag pv-tag-you">You</span>
      </div>
      <div className="preview-body">
        <div className="row-between">
          <div>
            <div className="muted small">Arriving in</div>
            <div className="eta-box"><span className="eta-num">9</span><span>min</span></div>
          </div>
          <span className="badge status-en_route">On the way</span>
        </div>
        <div className="preview-line"><span>Petrol · 5 L</span><strong>₹563</strong></div>
        <div className="preview-steps">
          {['Booked', 'Accepted', 'On the way', 'Arrived'].map((s, i) => (
            <span key={s} className={i < 3 ? 'on' : ''}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const { stats, pricing } = usePublicData()
  if (user) return <Navigate to={homePathFor(user)} replace />

  const cfg = Object.fromEntries((pricing?.config || []).map((c) => [c.key, c.value]))
  const fuelPrices = pricing?.fuel_prices || []

  return (
    <div className="landing">
      <nav className="landing-nav">
        <Logo />
        <div className="landing-links only-desktop">
          <a href="#how">How it works</a>
          <a href="#services">Services</a>
          <a href="#pricing">Pricing</a>
          <a href="#partners">Partners</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="row">
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/register" className="btn btn-primary">Sign up</Link>
        </div>
      </nav>

      <header className="hero">
        <div className="hero-inner">
          <div>
            <span className="hero-kicker">Roadside help in Mysuru, 24 × 7</span>
            <h1>Out of fuel or broken down? <em>Help is minutes away.</em></h1>
            <p>FuelGo brings emergency fuel and verified mechanics to wherever your vehicle stopped. Book in a few taps, see the price up front, and track your helper live.</p>
            <div className="btn-row" style={{ marginTop: 24 }}>
              <Link to="/register" className="btn btn-primary btn-lg"><Icon name="alert" /> Get help now</Link>
              <a href="#how" className="btn btn-outline-light btn-lg">See how it works</a>
            </div>
            <div className="hero-stats">
              <div><strong>{stats?.avg_arrival_minutes ? `${stats.avg_arrival_minutes} min` : '—'}</strong><span>average arrival</span></div>
              <div><strong>{stats?.avg_rating ? `${stats.avg_rating} ★` : '—'}</strong><span>{stats?.rating_count ? `from ${stats.rating_count} ratings` : 'customer rating'}</span></div>
              <div><strong>{stats ? stats.completed_requests.toLocaleString('en-IN') : '—'}</strong><span>rescues completed</span></div>
            </div>
          </div>
          <TrackingPreview />
        </div>
      </header>

      <section className="section" id="how">
        <h2 className="section-title">How it works</h2>
        <p className="section-sub muted">From "my car stopped" to "help is here" in four steps.</p>
        <div className="grid grid-4 steps">
          {STEPS.map((s, i) => (
            <div className="card step" key={s.title}>
              <span className="step-num">{i + 1}</span>
              <div className="feature-icon"><Icon name={s.icon} size={22} /></div>
              <h3>{s.title}</h3>
              <p className="muted" style={{ margin: 0 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section section-alt" id="services">
        <div className="section-inner">
          <h2 className="section-title">Two services, one app</h2>
          <div className="grid grid-2">
            <div className="card service-card">
              <div className="service-head">
                <span className="qa-icon fuel"><Icon name="fuel" size={26} /></span>
                <div><h3 style={{ margin: 0 }}>Emergency fuel delivery</h3><span className="muted small">Petrol · Diesel · CNG</span></div>
              </div>
              <p className="muted">Ran dry on the ring road or in your driveway? A fuel partner brings 1–60 litres in a certified container, at the regular pump price plus a small delivery fee.</p>
              <ul className="ticks">
                <li><Icon name="check" size={16} /> Fuel at the published price per litre</li>
                <li><Icon name="check" size={16} /> Matched to your vehicle's fuel type</li>
                <li><Icon name="check" size={16} /> Delivery from {cfg.fuel_base_delivery_fee != null ? money(cfg.fuel_base_delivery_fee) : '—'}</li>
              </ul>
              <Link to="/register" className="btn btn-primary">Order fuel</Link>
            </div>
            <div className="card service-card">
              <div className="service-head">
                <span className="qa-icon mech"><Icon name="wrench" size={26} /></span>
                <div><h3 style={{ margin: 0 }}>Mechanic assistance</h3><span className="muted small">Repairs on the spot or a tow to the garage</span></div>
              </div>
              <p className="muted">Describe the problem, add a photo if you like, and the nearest verified mechanic comes to you.</p>
              <ul className="ticks two-col">
                {['flat_tyre', 'battery_jumpstart', 'engine_trouble', 'towing', 'general'].map((c) => (
                  <li key={c}><Icon name="check" size={16} /> {PROBLEM_LABELS[c]}{cfg[`mechanic_base_${c}`] != null && <span className="muted"> · from {money(cfg[`mechanic_base_${c}`])}</span>}</li>
                ))}
              </ul>
              <Link to="/register" className="btn btn-dark">Get a mechanic</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <h2 className="section-title">Transparent pricing</h2>
        <p className="section-sub muted">Today's rates. You always see the full breakdown before you book.</p>
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <h3>Fuel prices</h3>
            <div className="price-list">
              {fuelPrices.length ? fuelPrices.map((f) => (
                <div key={f.fuel_type} className="price-row">
                  <span>{FUEL_LABELS[f.fuel_type]}</span>
                  <strong>{money(f.price_per_litre)} <span className="muted small">/ litre</span></strong>
                </div>
              )) : <p className="muted">Prices load from the live server.</p>}
            </div>
          </div>
          <div className="card">
            <h3>Service fees</h3>
            <div className="price-list">
              <div className="price-row"><span>Fuel delivery fee</span><strong>{money(cfg.fuel_base_delivery_fee)}</strong></div>
              <div className="price-row"><span>Included distance</span><strong>{cfg.free_distance_km ?? '—'} km</strong></div>
              <div className="price-row"><span>Extra distance (fuel / mechanic)</span><strong>{money(cfg.fuel_per_km_fee)} / {money(cfg.mechanic_per_km_fee)} per km</strong></div>
              <div className="price-row"><span>Night surcharge (10 pm–6 am, on fees only)</span><strong>{cfg.night_surcharge_pct ?? '—'}%</strong></div>
            </div>
            <p className="muted small" style={{ margin: '10px 0 0' }}>Example: 5 L petrol delivered 1.5 km away costs about {fuelPrices[0] && cfg.fuel_base_delivery_fee != null ? money(fuelPrices.find((f) => f.fuel_type === 'petrol')?.price_per_litre * 5 + cfg.fuel_base_delivery_fee) : '—'}.</p>
          </div>
        </div>
      </section>

      <section className="section section-alt">
        <div className="section-inner">
          <h2 className="section-title">Why drivers trust FuelGo</h2>
          <div className="grid grid-3">
            {FEATURES.map((f) => (
              <div className="card feature" key={f.title}>
                <div className="feature-icon"><Icon name={f.icon} size={22} /></div>
                <h3>{f.title}</h3>
                <p className="muted" style={{ margin: 0 }}>{f.text}</p>
              </div>
            ))}
          </div>
          {stats?.reviews?.length > 0 && (
            <>
              <h3 style={{ marginTop: 36 }}>What customers say</h3>
              <div className="grid grid-3">
                {stats.reviews.map((r, i) => (
                  <figure className="card review" key={i}>
                    <StarRating value={r.rating} readOnly size={16} />
                    <blockquote>“{r.comment}”</blockquote>
                    <figcaption className="muted small">{r.name} · {r.service === 'fuel' ? 'Fuel delivery' : 'Mechanic'} by {r.provider}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="section" id="partners">
        <div className="partner-band">
          <div>
            <h2 style={{ color: '#fff' }}>Own a fuel bowser, garage or tow truck?</h2>
            <p>Join {stats ? stats.fuel_partners + stats.mechanic_partners : 'our'} verified partners across {stats?.zones_served || 10} Mysuru areas. Get nearby jobs on your phone, go online when you want, and get paid by UPI or cash.</p>
            <ul className="ticks light">
              <li><Icon name="check" size={16} /> Free sign-up, verified within a day</li>
              <li><Icon name="check" size={16} /> Only jobs within your service radius</li>
              <li><Icon name="check" size={16} /> Earnings dashboard and ratings</li>
            </ul>
          </div>
          <Link to="/register?role=provider" className="btn btn-primary btn-lg">Become a partner</Link>
        </div>
      </section>

      <section className="section" id="faq">
        <h2 className="section-title">Frequently asked questions</h2>
        <div className="faq">
          {FAQ.map(([q, a]) => (
            <details key={q} className="card">
              <summary>{q}</summary>
              <p className="muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section cta-final">
        <h2>Don't wait for a stranger to stop.</h2>
        <p className="muted">Create a free account now so help is one tap away when you need it.</p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <Link to="/register" className="btn btn-primary btn-lg">Create free account</Link>
          <Link to="/login" className="btn btn-secondary btn-lg">I already have an account</Link>
        </div>
      </section>

      <footer className="footer">
        <div className="footer-inner">
          <Logo />
          <span>Integrated Fuel Delivery and Mechanic Service Platform · Mysuru, Karnataka</span>
          <span>MCA Semester 3 Project · MPRJ382</span>
        </div>
      </footer>
    </div>
  )
}
