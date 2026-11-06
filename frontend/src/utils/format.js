export const STATUS_LABELS = {
  PENDING: 'Pending',
  ACCEPTED: 'Accepted',
  EN_ROUTE: 'On the way',
  ARRIVED: 'Arrived',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  REJECTED: 'No provider',
  CANCELLED: 'Cancelled',
}

export const LIFECYCLE = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED']
export const ACTIVE_STATUSES = ['PENDING', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']

export const NEXT_STATUS = {
  ACCEPTED: { status: 'EN_ROUTE', label: 'Start driving' },
  EN_ROUTE: { status: 'ARRIVED', label: 'Mark arrived' },
  ARRIVED: { status: 'IN_PROGRESS', label: 'Start service' },
  IN_PROGRESS: { status: 'COMPLETED', label: 'Complete job' },
}

export const PROBLEM_LABELS = {
  flat_tyre: 'Flat tyre',
  battery_jumpstart: 'Battery jumpstart',
  engine_trouble: 'Engine trouble',
  towing: 'Towing',
  general: 'General repair',
}

export const FUEL_LABELS = { petrol: 'Petrol', diesel: 'Diesel', cng: 'CNG', electric: 'Electric' }

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
export const money = (v) => (v == null || Number.isNaN(Number(v)) ? '—' : inr.format(Number(v)))

export function dateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

export function shortDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return `${Math.floor(s / 86400)} d ago`
}

export function serviceTitle(req) {
  if (!req) return ''
  if (req.service_type === 'fuel') return `${FUEL_LABELS[req.fuel_type] || 'Fuel'} delivery · ${req.quantity_litres} L`
  return PROBLEM_LABELS[req.problem_category] || 'Mechanic assistance'
}

export const km = (v) => (v == null ? '—' : `${Number(v).toFixed(1)} km`)

export function hourLabel(h) {
  const suffix = h < 12 ? 'am' : 'pm'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}${suffix}`
}

export function directionsUrl(lat, lng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
}
