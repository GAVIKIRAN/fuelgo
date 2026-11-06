import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import Icon from '../../components/Icon'
import { LocationPicker } from '../../components/Maps'
import { EmptyState, ErrorState, Loading, PageHeader, Spinner, StarRating } from '../../components/ui'
import { requestApi } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { useCreateRequest } from '../../hooks/useCreateRequest'
import { loadDraft } from '../../utils/draft'
import { km, money } from '../../utils/format'

export default function ProviderSelection() {
  const draft = loadDraft()
  const [selected, setSelected] = useState(null)
  const { submit, submitting } = useCreateRequest()
  const providers = useAsync(
    () => (draft ? requestApi.match({ ...draft.payload, vehicle_id: undefined, description: undefined, address: undefined }) : Promise.resolve(null)),
    [],
  )
  if (!draft) return <Navigate to="/app" replace />

  const items = providers.data?.items || []
  const back = draft.kind === 'fuel' ? '/app/fuel' : '/app/mechanic'
  const loc = { lat: draft.payload.lat, lng: draft.payload.lng }

  return (
    <div>
      <PageHeader
        title="Choose a provider"
        subtitle={`${draft.summary} · ranked by distance, rating and ETA`}
        actions={<Link to={back} className="btn btn-ghost"><Icon name="chevronLeft" size={16} /> Edit request</Link>}
      />
      {providers.loading ? <Loading text="Finding providers near you…" /> : providers.error ? (
        <ErrorState message={providers.error} onRetry={providers.reload} />
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState icon="pin" title="No providers nearby right now"
            text="All nearby providers are busy or offline. Try again in a few minutes. Your details are saved."
            action={<button className="btn btn-primary" onClick={() => providers.reload()}><Icon name="refresh" size={16} /> Search again</button>} />
        </div>
      ) : (
        <div className="split">
          <div className="stack">
            <div className="list" role="radiogroup" aria-label="Providers">
              {items.map((p, i) => (
                <button key={p.id} role="radio" aria-checked={selected === p.id}
                  className={`provider-card ${selected === p.id ? 'selected' : ''}`} onClick={() => setSelected(p.id)}>
                  <span className={`li-icon ${p.provider_type === 'fuel' ? 'fuel' : ''}`}><Icon name={p.provider_type === 'fuel' ? 'fuel' : 'wrench'} /></span>
                  <div className="pc-main">
                    <div className="row" style={{ gap: 8 }}>
                      <strong>{p.business_name}</strong>
                      {i === 0 && <span className="best-tag">BEST MATCH</span>}
                    </div>
                    <div className="pc-meta">
                      <span>{km(p.distance_km)}</span>
                      <span>ETA {p.eta_minutes} min</span>
                      <span className="row" style={{ gap: 4 }}>
                        <StarRating value={p.rating_avg} readOnly size={13} />
                        {p.rating_count ? `${p.rating_avg.toFixed(1)} (${p.rating_count})` : 'New'}
                      </span>
                    </div>
                  </div>
                  <div className="pc-price">{money(p.estimate)}</div>
                </button>
              ))}
            </div>
            <div className="card">
              <div className="stack" style={{ gap: 10 }}>
                <button className="btn btn-primary btn-lg btn-block" disabled={!selected || submitting}
                  onClick={() => submit(draft, { providerId: selected, autoAssign: false })}>
                  {submitting ? <Spinner size={18} /> : selected ? `Book ${items.find((p) => p.id === selected)?.business_name}` : 'Select a provider'}
                </button>
                <button className="btn btn-secondary btn-block" disabled={submitting} onClick={() => submit(draft, { autoAssign: true })}>
                  Auto-assign best match
                </button>
                <p className="muted small" style={{ margin: 0 }}>If a provider declines, we automatically pass your request to the next nearest one.</p>
              </div>
            </div>
          </div>
          <div className="card">
            <h3>On the map</h3>
            <LocationPicker value={loc} onChange={() => {}} providers={items} height={420} />
          </div>
        </div>
      )}
    </div>
  )
}
