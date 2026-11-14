import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { Logo, ThemeToggle } from '../components/Layout'
import { CountUp, StarRating } from '../components/ui'
import { metaApi } from '../api'
import api from '../api/client'
import { homePathFor, useAuth } from '../context/AuthContext'
import { FUEL_LABELS, PROBLEM_LABELS, money } from '../utils/format'
import garageInterior from '../assets/photos/garage-interior.webp'
import garageTeam from '../assets/photos/garage-team.webp'
import mechanicEngine from '../assets/photos/mechanic-engine.webp'
import mechanicHands from '../assets/photos/mechanic-hands.webp'
import stationNeon from '../assets/photos/station-neon.webp'
import stationNight from '../assets/photos/station-night.webp'

const STEP_PHOTOS = [stationNight, garageTeam, stationNeon, mechanicEngine]
const STEP_DWELL = 5000
const ZONES = ['Vijayanagar', 'Kuvempunagar', 'Gokulam', 'Jayalakshmipuram', 'Nazarbad', 'Saraswathipuram', 'Hebbal', 'Bannimantap', 'Chamundipuram', 'Devaraja Mohalla']

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

/** Fades sections in as they scroll into view. Content stays visible where this cannot run. */
function useReveal(rootRef, deps) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || typeof IntersectionObserver === 'undefined') return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    root.classList.add('reveal-on')
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return
        e.target.classList.add('in')
        io.unobserve(e.target)
      })
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
    root.querySelectorAll('[data-reveal]:not(.in)').forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

function HeroCards() {
  // Illustrative only (no live data).
  return (
    <div className="lp-floats" aria-hidden="true">
      <div className="lp-float lp-float-a">
        <div className="lp-glass">
          <div className="lp-glass-head"><span className="ring"><Icon name="navigation" size={17} /></span><span>Chamundi<br />Fuel Express</span></div>
          <svg viewBox="0 0 230 96" className="lp-route">
            <path d="M20 78 C60 62 80 40 120 40 S180 26 210 18" className="road" />
            <path d="M20 78 C60 62 80 40 120 40 S180 26 210 18" className="path" />
            <circle cx="210" cy="18" r="6" className="dest" />
            <circle r="7" className="van" />
          </svg>
          <div className="lp-glass-nums">
            <div><small>Arriving in</small><strong>9<sub>min</sub></strong></div>
            <div><small>Distance</small><strong>1.5<sub>km</sub></strong></div>
          </div>
        </div>
      </div>
      <div className="lp-float lp-float-b">
        <div className="lp-glass dark">
          <div className="lp-glass-head"><span className="ring"><Icon name="fuel" size={17} /></span><span>Petrol · 5 L<br />Price locked</span></div>
          <div className="lp-glass-nums">
            <div><small>Total</small><strong>₹563</strong></div>
            <div><small>Paid by</small><strong>UPI</strong></div>
          </div>
        </div>
      </div>
    </div>
  )
}

function HowItWorks() {
  const [step, setStep] = useState(0)
  const [auto, setAuto] = useState(true)
  useEffect(() => {
    if (!auto) return undefined
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_DWELL)
    return () => clearTimeout(t)
  }, [step, auto])
  return (
    <div className="lp-how" onMouseEnter={() => setAuto(false)} onMouseLeave={() => setAuto(true)}>
      <div className="lp-steps" data-reveal="left">
        {STEPS.map((s, i) => (
          <button type="button" key={s.title} className={`lp-step ${i === step ? 'active' : ''}`} aria-pressed={i === step}
            style={{ '--dwell': auto ? `${STEP_DWELL}ms` : '0.4s' }} onClick={() => setStep(i)}>
            <Icon name={s.icon} size={22} />
            <strong>{s.title}</strong>
            <span><i>{s.text}</i></span>
          </button>
        ))}
      </div>
      <div className="lp-how-media" data-reveal="right">
        {STEP_PHOTOS.map((src, i) => <img key={src} src={src} alt="" loading="lazy" className={i === step ? 'on' : ''} />)}
        <div className="lp-how-cap lp-glass dark" key={step}><b>{step + 1}</b><span>{STEPS[step].title}</span></div>
      </div>
    </div>
  )
}

export default function Landing() {
  const { user } = useAuth()
  const { stats, pricing } = usePublicData()
  const root = useRef(null)
  const [scrolled, setScrolled] = useState(false)
  useReveal(root, [stats, pricing, !!user])
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  if (user) return <Navigate to={homePathFor(user)} replace />

  const cfg = Object.fromEntries((pricing?.config || []).map((c) => [c.key, c.value]))
  const fuelPrices = pricing?.fuel_prices || []
  const petrol = fuelPrices.find((f) => f.fuel_type === 'petrol')?.price_per_litre
  const example = petrol != null && cfg.fuel_base_delivery_fee != null ? petrol * 5 + cfg.fuel_base_delivery_fee : null
  const partners = stats ? stats.fuel_partners + stats.mechanic_partners : null

  return (
    <div className="lp" ref={root}>
      <nav className={`lp-nav ${scrolled ? 'scrolled' : ''}`}>
        <Logo />
        <div className="lp-links only-desktop">
          <a href="#how">How it works</a>
          <a href="#services">Services</a>
          <a href="#pricing">Pricing</a>
          <a href="#partners">Partners</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="row">
          <ThemeToggle />
          <Link to="/login" className="btn btn-ghost">Log in</Link>
          <Link to="/register" className="btn btn-dark">Sign up</Link>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-hero-bg" />
        <div className="lp-hero-copy">
          <span className="lp-kicker">Roadside help in Mysuru, 24 × 7</span>
          <h1>Out of fuel or broken down? <em>Help is minutes away.</em></h1>
          <p>FuelGo brings emergency fuel and verified mechanics to wherever your vehicle stopped. Book in a few taps, see the price up front, and track your helper live.</p>
          <div className="btn-row">
            <Link to="/register" className="btn btn-primary btn-lg">Get help now <Icon name="arrowRight" size={18} /></Link>
            <a href="#how" className="btn btn-glass btn-lg">See how it works</a>
          </div>
        </div>
        <HeroCards />
      </header>

      <div className="lp-marquee" aria-hidden="true">
        <div>{[...ZONES, ...ZONES].map((z, i) => <span key={i}>{z}</span>)}</div>
      </div>

      <section className="lp-section">
        <div className="lp-head" data-reveal>
          <span className="lp-kicker">Help you can count on</span>
          <h2>Faster rescues.<br /><span>Calmer breakdowns.</span></h2>
          <p>Real numbers from the FuelGo network in Mysuru.</p>
        </div>
        <div className="lp-bento">
          <div className="lp-tile" data-reveal style={{ '--i': 0 }}>
            <div><strong>{stats?.avg_arrival_minutes ? <CountUp value={stats.avg_arrival_minutes} format={(n) => `${Math.round(n)} min`} /> : '—'}</strong><span>average arrival</span></div>
            <small>From booking to a partner at your vehicle.</small>
          </div>
          <div className="lp-tile-photo" data-reveal="zoom" style={{ '--i': 1 }}>
            <img src={mechanicEngine} alt="A mechanic working under the bonnet of a car" loading="lazy" />
            <h3>Back on the road.<br /><span>In minutes.</span></h3>
            <span className="small">Verified fuel agents and mechanics, sent to your exact spot.</span>
          </div>
          <div className="lp-tile" data-reveal style={{ '--i': 2 }}>
            <div><strong>{stats?.avg_rating ? <CountUp value={stats.avg_rating} format={(n) => `${n.toFixed(1)} ★`} /> : '—'}</strong><span>{stats?.rating_count ? `from ${stats.rating_count} ratings` : 'customer rating'}</span></div>
            <small>Every job is rated by the driver it helped.</small>
          </div>
          <div className="lp-tile" data-reveal style={{ '--i': 3 }}>
            <div><strong>{stats ? <CountUp value={stats.completed_requests} /> : '—'}</strong><span>rescues completed</span></div>
            <small>Fuel deliveries and roadside repairs.</small>
          </div>
          <div className="lp-tile" data-reveal style={{ '--i': 4 }}>
            <div><strong>{partners != null ? <CountUp value={partners} /> : '—'}</strong><span>verified partners</span></div>
            <small>Across {stats?.zones_served || 10} areas of the city.</small>
          </div>
        </div>
      </section>

      <section className="lp-section" id="how">
        <div className="lp-head left" data-reveal>
          <span className="lp-kicker">How it works</span>
          <h2>From "my car stopped"<br /><span>to "help is here".</span></h2>
          <p>Four steps, start to finish.</p>
        </div>
        <HowItWorks />
      </section>

      <section className="lp-section" id="services">
        <div className="lp-head" data-reveal>
          <span className="lp-kicker">Two services, one app</span>
          <h2>Fuel when you run dry.<br /><span>A mechanic when you break down.</span></h2>
        </div>
        <div className="lp-services">
          <article className="lp-service" data-reveal style={{ '--i': 0 }}>
            <div className="lp-service-img">
              <img src={stationNight} alt="A car at a fuel station at night" loading="lazy" />
              <span className="badge">Petrol · Diesel · CNG</span>
            </div>
            <div className="lp-service-body">
              <h3>Emergency fuel delivery</h3>
              <p className="muted">Ran dry on the ring road or in your driveway? A fuel partner brings 1–60 litres in a certified container, at the regular pump price plus a small delivery fee.</p>
              <ul className="ticks">
                <li><Icon name="check" size={16} /> Fuel at the published price per litre</li>
                <li><Icon name="check" size={16} /> Matched to your vehicle's fuel type</li>
                <li><Icon name="check" size={16} /> Delivery from {cfg.fuel_base_delivery_fee != null ? money(cfg.fuel_base_delivery_fee) : '—'}</li>
              </ul>
              <Link to="/register" className="btn btn-primary">Order fuel</Link>
            </div>
          </article>
          <article className="lp-service" data-reveal style={{ '--i': 1 }}>
            <div className="lp-service-img">
              <img src={mechanicHands} alt="A mechanic's hands working on a car engine" loading="lazy" />
              <span className="badge">On the spot or towed</span>
            </div>
            <div className="lp-service-body">
              <h3>Mechanic assistance</h3>
              <p className="muted">Describe the problem, add a photo if you like, and the nearest verified mechanic comes to you.</p>
              <ul className="ticks two-col">
                {['flat_tyre', 'battery_jumpstart', 'engine_trouble', 'towing', 'general'].map((c) => (
                  <li key={c}><Icon name="check" size={16} /> <span>{PROBLEM_LABELS[c]}{cfg[`mechanic_base_${c}`] != null && <span className="muted"> · from {money(cfg[`mechanic_base_${c}`])}</span>}</span></li>
                ))}
              </ul>
              <Link to="/register" className="btn btn-dark">Get a mechanic</Link>
            </div>
          </article>
        </div>
      </section>

      <section className="lp-dark">
        <div className="lp-dark-photo" data-reveal="zoom" aria-hidden="true">
          <img src={stationNeon} alt="" loading="lazy" className="lp-cover" />
          <div className="lp-status lp-glass"><span className="ring"><Icon name="check" size={16} /></span><div><strong>Request accepted</strong><small>Verified partner assigned</small></div></div>
          <div className="lp-status lp-glass"><span className="ring"><Icon name="navigation" size={16} /></span><div><strong>On the way</strong><small>Live ETA on the map</small></div></div>
          <div className="lp-status lp-glass"><span className="ring"><Icon name="pin" size={16} /></span><div><strong>Arrived</strong><small>Pay and rate when done</small></div></div>
        </div>
        <div>
          <div className="lp-head left" data-reveal>
            <span className="lp-kicker">Built for the worst moment</span>
            <h2>Why drivers <span>trust FuelGo</span></h2>
          </div>
          <div className="lp-feats">
            {FEATURES.map((f, i) => (
              <div className="lp-feat" key={f.title} data-reveal style={{ '--i': i % 2 }}>
                <Icon name={f.icon} size={24} />
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="pricing">
        <div className="lp-head" data-reveal>
          <span className="lp-kicker">Transparent pricing</span>
          <h2>Simple rates.<br /><span>No surprises.</span></h2>
          <p>Today's rates. You always see the full breakdown before you book.</p>
        </div>
        <div className="lp-pricing">
          <div className="lp-price" data-reveal style={{ '--i': 0 }}>
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
          <div className="lp-price" data-reveal style={{ '--i': 1 }}>
            <h3>Service fees</h3>
            <div className="price-list">
              <div className="price-row"><span>Fuel delivery fee</span><strong>{money(cfg.fuel_base_delivery_fee)}</strong></div>
              <div className="price-row"><span>Included distance</span><strong>{cfg.free_distance_km ?? '—'} km</strong></div>
              <div className="price-row"><span>Extra distance (fuel / mechanic)</span><strong>{money(cfg.fuel_per_km_fee)} / {money(cfg.mechanic_per_km_fee)} per km</strong></div>
              <div className="price-row"><span>Night surcharge (10 pm–6 am, on fees only)</span><strong>{cfg.night_surcharge_pct ?? '—'}%</strong></div>
            </div>
          </div>
          <div className="lp-price feature" data-reveal style={{ '--i': 2 }}>
            <div>
              <h3>Example bill</h3>
              <p>5 L petrol delivered 1.5 km away costs about</p>
            </div>
            <big>{example != null ? <CountUp value={example} format={(n) => money(Math.round(n))} /> : '—'}</big>
            <Link to="/register" className="btn">Book a delivery</Link>
          </div>
        </div>
        {stats?.reviews?.length > 0 && (
          <div style={{ marginTop: 72 }}>
            <h3 className="lp-subhead" data-reveal>What customers say</h3>
            <div className="lp-reviews">
              {stats.reviews.map((r, i) => (
                <figure className="lp-review" key={i} data-reveal style={{ '--i': i % 3 }}>
                  <StarRating value={r.rating} readOnly size={16} />
                  <blockquote>“{r.comment}”</blockquote>
                  <figcaption className="muted small">{r.name} · {r.service === 'fuel' ? 'Fuel delivery' : 'Mechanic'} by {r.provider}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="lp-section" id="partners" style={{ paddingTop: 0 }}>
        <div className="lp-partner" data-reveal="zoom">
          <img src={garageInterior} alt="" loading="lazy" className="lp-cover" />
          <div>
            <span className="lp-kicker" style={{ marginBottom: 16 }}>For partners</span>
            <h2>Own a fuel bowser, garage or tow truck?</h2>
            <p>Join {partners ?? 'our'} verified partners across {stats?.zones_served || 10} Mysuru areas. Get nearby jobs on your phone, go online when you want, and get paid by UPI or cash.</p>
            <ul className="ticks light">
              <li><Icon name="check" size={16} /> Free sign-up, verified within a day</li>
              <li><Icon name="check" size={16} /> Only jobs within your service radius</li>
              <li><Icon name="check" size={16} /> Earnings dashboard and ratings</li>
            </ul>
          </div>
          <Link to="/register?role=provider" className="btn btn-primary btn-lg">Become a partner</Link>
        </div>
      </section>

      <section className="lp-section" id="faq" style={{ paddingTop: 0 }}>
        <div className="lp-head" data-reveal>
          <span className="lp-kicker">FAQ</span>
          <h2>Frequently asked <span>questions</span></h2>
        </div>
        <div className="faq">
          {FAQ.map(([q, a], i) => (
            <details key={q} className="card" data-reveal style={{ '--i': i % 3 }}>
              <summary>{q}</summary>
              <p className="muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="lp-section lp-cta" style={{ paddingTop: 0 }}>
        <h2 data-reveal>Don't wait for<br /><span className="lp-grad">a stranger to stop.</span></h2>
        <p className="muted" data-reveal>Create a free account now so help is one tap away when you need it.</p>
        <div className="btn-row" style={{ justifyContent: 'center' }} data-reveal>
          <Link to="/register" className="btn btn-primary btn-lg">Create free account</Link>
          <Link to="/login" className="btn btn-secondary btn-lg">I already have an account</Link>
        </div>
      </section>

      <footer className="lp-footer">
        <Logo />
        <span>Integrated Fuel Delivery and Mechanic Service Platform · Mysuru, Karnataka</span>
        <span>MCA Semester 3 Project · MPRJ382</span>
      </footer>
    </div>
  )
}
