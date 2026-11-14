import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import { STATUS_LABELS, money } from '../utils/format'

export function Spinner({ size = 20, label = 'Loading' }) {
  return <span className="spinner" style={{ width: size, height: size }} role="status" aria-label={label} />
}

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="state-block" aria-busy="true">
      <Spinner size={28} />
      <p>{text}</p>
    </div>
  )
}

export function EmptyState({ icon = 'list', title, text, action }) {
  return (
    <div className="state-block empty">
      <div className="state-icon"><Icon name={icon} size={26} /></div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-block error" role="alert">
      <div className="state-icon"><Icon name="alert" size={26} /></div>
      <h3>Couldn't load this</h3>
      <p>{message}</p>
      {onRetry && <button className="btn btn-secondary" onClick={() => onRetry()}>Try again</button>}
    </div>
  )
}

export function StatusBadge({ status }) {
  return <span className={`badge status-${(status || '').toLowerCase()}`}>{STATUS_LABELS[status] || status}</span>
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

const motionOff = () =>
  typeof IntersectionObserver === 'undefined' ||
  typeof requestAnimationFrame === 'undefined' ||
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Counts up to `value` the first time it scrolls into view (and between live updates). */
export function CountUp({ value, format = (n) => n.toLocaleString('en-IN'), duration = 900 }) {
  const valid = typeof value === 'number' && Number.isFinite(value)
  const [shown, setShown] = useState(() => (valid && !motionOff() ? 0 : value))
  const ref = useRef(null)
  const from = useRef(0)
  useEffect(() => {
    if (!valid) return undefined
    if (motionOff() || !ref.current) {
      setShown(value)
      return undefined
    }
    let raf
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      io.disconnect()
      const start = from.current
      const t0 = performance.now()
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / duration)
        const v = start + (value - start) * (1 - (1 - p) ** 3)
        from.current = v
        setShown(p < 1 ? v : value)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    })
    io.observe(ref.current)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value, valid, duration])
  if (!valid) return <span ref={ref}>—</span>
  const n = typeof shown === 'number' ? shown : value
  return <span ref={ref}>{format(n === value ? value : Number(n.toFixed(Number.isInteger(value) ? 0 : 1)))}</span>
}

/** `num` (+ optional `format`) animates the figure; `value` shows it as-is. `to` makes the corner chip a link. */
export function StatCard({ label, value, num, format, hint, icon, tone, featured = false, to }) {
  const chip = <Icon name={to ? 'arrowUpRight' : icon} size={16} />
  return (
    <div className={`stat-card ${featured ? 'featured' : ''} ${tone === 'red' ? 'alert-tone' : ''}`}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {to ? <Link to={to} className="stat-icon" aria-label={`Open ${label}`}>{chip}</Link> : icon && <span className="stat-icon">{chip}</span>}
      </div>
      <div className="stat-value">{num !== undefined ? <CountUp value={num} format={format} /> : value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

export function Modal({ open, title, onClose, children, footer }) {
  const ref = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  // Focus the dialog only when it opens. Depending on `onClose` (a new function on
  // every parent render) re-ran this on each keystroke and stole focus from inputs.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current?.()
    document.addEventListener('keydown', onKey)
    const first = ref.current?.querySelector('input, select, textarea')
    ;(first || ref.current)?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Pagination({ pagination, onPage }) {
  if (!pagination || pagination.pages <= 1) return null
  const { page, pages, total } = pagination
  return (
    <div className="pagination">
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <Icon name="chevronLeft" size={16} /> Prev
      </button>
      <span>Page {page} of {pages} · {total} total</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next <Icon name="chevronRight" size={16} />
      </button>
    </div>
  )
}

export function StarRating({ value = 0, onChange, size = 28, readOnly = false }) {
  const stars = [1, 2, 3, 4, 5]
  if (readOnly) {
    return (
      <span className="stars readonly" aria-label={`${value} out of 5 stars`}>
        {stars.map((s) => (
          <span key={s} className={s <= Math.round(value) ? 'on' : ''}><Icon name="star" size={size} /></span>
        ))}
      </span>
    )
  }
  return (
    <div className="stars" role="radiogroup" aria-label="Rating">
      {stars.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={value === s}
          aria-label={`${s} star${s > 1 ? 's' : ''}`}
          className={s <= value ? 'on' : ''}
          onClick={() => onChange(s)}
        >
          <Icon name="star" size={size} />
        </button>
      ))}
    </div>
  )
}

export function PriceBreakdown({ breakdown, finalPrice }) {
  if (!breakdown) return null
  return (
    <div className="breakdown">
      {breakdown.lines.map((l) => (
        <div className="breakdown-row" key={l.label}>
          <span>{l.label}</span>
          <span>{money(l.amount)}</span>
        </div>
      ))}
      <div className="breakdown-row total">
        <span>{finalPrice != null ? 'Estimated total' : 'Total estimate'}</span>
        <span>{money(breakdown.total)}</span>
      </div>
      {finalPrice != null && finalPrice !== breakdown.total && (
        <div className="breakdown-row total final">
          <span>Final amount</span>
          <span>{money(finalPrice)}</span>
        </div>
      )}
    </div>
  )
}

export function Field({ label, error, hint, children, id }) {
  const autoId = useId()
  const fieldId = id || autoId
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      {label && <label htmlFor={fieldId}>{label}</label>}
      {typeof children === 'function' ? children(fieldId) : children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Segmented({ options, value, onChange, name }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.icon && <Icon name={o.icon} size={18} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}
