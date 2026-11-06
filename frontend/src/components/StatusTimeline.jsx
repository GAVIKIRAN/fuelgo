import Icon from './Icon'
import { LIFECYCLE, STATUS_LABELS, dateTime } from '../utils/format'

/** Vertical lifecycle stepper; uses status history for timestamps. */
export default function StatusTimeline({ request }) {
  const history = request.history || []
  const terminalBad = ['CANCELLED', 'REJECTED'].includes(request.status)
  const reached = (s) => history.find((h) => h.status === s)
  const currentIdx = LIFECYCLE.indexOf(request.status)

  const steps = terminalBad
    ? [...LIFECYCLE.filter((s) => reached(s)), request.status]
    : LIFECYCLE

  return (
    <ol className="timeline">
      {steps.map((s, i) => {
        const h = [...history].reverse().find((x) => x.status === s)
        const idx = LIFECYCLE.indexOf(s)
        let cls = ''
        if (terminalBad) cls = s === request.status ? 'current' : 'done'
        else if (idx < currentIdx || request.status === 'COMPLETED') cls = 'done'
        else if (idx === currentIdx) cls = 'current'
        return (
          <li key={`${s}-${i}`} className={cls}>
            <span className="dot">{cls === 'done' && <Icon name="check" size={14} strokeWidth={3} />}</span>
            <div>
              <div className="tl-label">{STATUS_LABELS[s]}</div>
              {h && <div className="tl-time">{dateTime(h.created_at)}{h.note ? ` · ${h.note}` : ''}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
