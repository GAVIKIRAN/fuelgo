import { useId } from 'react'
import { CountUp } from './ui'

/** Rounded "pill" bars. Days with no value are drawn hatched; the tallest is highlighted. */
export function PillBars({ data, format = (v) => v, height = 190 }) {
  const max = Math.max(0, ...data.map((d) => d.value))
  const peak = data.findIndex((d) => max > 0 && d.value === max)
  return (
    <div className="pillbars" style={{ height }} role="img"
      aria-label={data.map((d) => `${d.full || d.label}: ${format(d.value)}`).join(', ')}>
      {data.map((d, i) => {
        const cls = !d.value ? 'empty' : i === peak ? 'peak' : i % 2 ? 'alt' : ''
        const pct = d.value ? Math.max(24, Math.round((d.value / max) * 100)) : 38
        return (
          <div key={d.full || `${d.label}${i}`} className={`pillbar ${cls}`} title={`${d.full || d.label}: ${format(d.value)}`}>
            <div className="pillbar-track">
              <i style={{ height: `${pct}%`, animationDelay: `${i * 70}ms` }}>{i === peak && <b>{format(d.value)}</b>}</i>
            </div>
            <span>{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}

/** Half-circle progress gauge, `value` from 0 to 1. */
export function Gauge({ value, label }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '')
  const pct = Math.round(Math.max(0, Math.min(1, value || 0)) * 100)
  const arc = 'M16 100 A84 84 0 0 1 184 100'
  return (
    <div className="gauge">
      <svg viewBox="0 0 200 114" role="img" aria-label={`${pct}% ${label}`}>
        <defs>
          <linearGradient id={`${id}f`} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#67070B" />
            <stop offset="0.55" stopColor="#C72A17" />
            <stop offset="1" stopColor="#E68232" />
          </linearGradient>
          <pattern id={`${id}h`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="2" height="6" fill="currentColor" />
          </pattern>
        </defs>
        <path d={arc} className="gauge-track" stroke={`url(#${id}h)`} />
        {pct > 0 && (
          <path d={arc} className="gauge-fill" pathLength="100" stroke={`url(#${id}f)`}
            strokeDasharray={`${pct} 100`} style={{ '--pct': pct }} />
        )}
      </svg>
      <div className="gauge-center">
        <strong><CountUp value={pct} format={(n) => `${Math.round(n)}%`} /></strong>
        <span>{label}</span>
      </div>
    </div>
  )
}

/** Buckets ISO-dated rows into the last `days` calendar days (oldest first). */
export function lastDays(rows, days = 7, getDate = (r) => r.created_at, getValue = () => 1) {
  const out = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push({
      key: d.toDateString(),
      label: d.toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 1),
      full: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      value: 0,
    })
  }
  const index = Object.fromEntries(out.map((o, i) => [o.key, i]))
  rows.forEach((r) => {
    const i = index[new Date(getDate(r)).toDateString()]
    if (i !== undefined) out[i].value += getValue(r)
  })
  return out
}
