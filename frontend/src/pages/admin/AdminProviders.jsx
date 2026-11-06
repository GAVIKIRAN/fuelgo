import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import Icon from '../../components/Icon'
import { Badge, EmptyState, ErrorState, Field, Loading, Modal, PageHeader, Pagination, StarRating } from '../../components/ui'
import { adminApi, openProtectedFile } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { shortDate } from '../../utils/format'

const TONES = { VERIFIED: 'green', PENDING: 'amber', REJECTED: 'red', SUSPENDED: 'red' }
const ACTION_LABELS = { VERIFIED: 'Verify', REJECTED: 'Reject', SUSPENDED: 'Suspend' }

export default function AdminProviders() {
  const [search] = useSearchParams()
  const [filters, setFilters] = useState({ status: search.get('status') || '', type: '', q: '', page: 1 })
  const [query, setQuery] = useState('')
  const [action, setAction] = useState(null) // {provider, status}
  const [note, setNote] = useState('')
  const [detail, setDetail] = useState(null)
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  const list = useAsync(() => adminApi.providers({ ...params, per_page: 12 }), [JSON.stringify(params)])

  const act = async () => {
    try {
      await adminApi.verifyProvider(action.provider.id, action.status, note || undefined)
      toast.success(`${action.provider.business_name}: ${action.status.toLowerCase()}`)
      setAction(null)
      setNote('')
      setDetail(null)
      list.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const actions = (p) => (
    <div className="actions">
      {p.verification_status !== 'VERIFIED' && <button className="btn btn-sm btn-success" onClick={() => setAction({ provider: p, status: 'VERIFIED' })}>Verify</button>}
      {p.verification_status === 'PENDING' && <button className="btn btn-sm btn-danger-outline" onClick={() => setAction({ provider: p, status: 'REJECTED' })}>Reject</button>}
      {p.verification_status === 'VERIFIED' && <button className="btn btn-sm btn-danger-outline" onClick={() => setAction({ provider: p, status: 'SUSPENDED' })}>Suspend</button>}
    </div>
  )

  return (
    <div>
      <PageHeader title="Providers" subtitle="Verify documents, approve or suspend partners" />
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setFilters({ ...filters, q: query, page: 1 }) }}>
        <input className="input" placeholder="Search name or area" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })} aria-label="Status">
          <option value="">All statuses</option>
          {Object.keys(TONES).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })} aria-label="Type">
          <option value="">All types</option>
          <option value="fuel">Fuel</option>
          <option value="mechanic">Mechanic</option>
        </select>
        <button className="btn btn-secondary btn-sm">Search</button>
      </form>
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.items.length === 0 ? <EmptyState icon="shield" title="No providers match" /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Provider</th><th>Type</th><th>Area</th><th>Status</th><th>Online</th><th>Rating</th><th>Docs</th><th>Joined</th><th /></tr></thead>
              <tbody>
                {list.data.items.map((p) => (
                  <tr key={p.id}>
                    <td><button className="link-btn" onClick={() => setDetail(p)}>{p.business_name}</button><div className="small muted">{p.name}</div></td>
                    <td>{p.provider_type}</td>
                    <td>{p.zone || '—'}</td>
                    <td><Badge tone={TONES[p.verification_status]}>{p.verification_status}</Badge></td>
                    <td>{p.is_available ? <Badge tone="green">Online</Badge> : <span className="muted">Offline</span>}</td>
                    <td>{p.rating_count ? `${p.rating_avg.toFixed(1)} (${p.rating_count})` : '—'}</td>
                    <td>{p.documents.length}</td>
                    <td>{shortDate(p.created_at)}</td>
                    <td>{actions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={list.data.pagination} onPage={(page) => setFilters({ ...filters, page })} />
        </>
      )}

      <Modal open={Boolean(detail)} title={detail?.business_name} onClose={() => setDetail(null)} footer={detail && actions(detail)}>
        {detail && (
          <div className="receipt">
            <div className="receipt-row"><span>Owner</span><span>{detail.name} · {detail.email}</span></div>
            <div className="receipt-row"><span>Phone</span><span>{detail.phone || '—'}</span></div>
            <div className="receipt-row"><span>Type</span><span>{detail.provider_type}{detail.fuel_types.length ? ` (${detail.fuel_types.join(', ')})` : ''}</span></div>
            <div className="receipt-row"><span>Area / radius</span><span>{detail.zone || '—'} · {detail.service_radius_km} km</span></div>
            <div className="receipt-row"><span>Vehicle</span><span>{detail.vehicle_info || '—'}</span></div>
            <div className="receipt-row"><span>Tools</span><span>{detail.tools_info || '—'}</span></div>
            <div className="receipt-row"><span>Rating</span><span><StarRating value={detail.rating_avg} readOnly size={14} /></span></div>
            {detail.verification_note && <div className="receipt-row"><span>Note</span><span>{detail.verification_note}</span></div>}
            <h3 style={{ marginTop: 16 }}>Documents</h3>
            {detail.documents.length === 0 ? <p className="muted">No documents uploaded.</p> : detail.documents.map((d) => (
              <div key={d.id} className="row-between" style={{ padding: '6px 0' }}>
                <span><Icon name="file" size={16} /> {d.doc_type.replace(/_/g, ' ')} · {d.original_name}</span>
                <button className="btn btn-ghost btn-sm" onClick={() => openProtectedFile(d.url).catch(() => toast.error('Could not open file'))}>Open</button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(action)} title={`${ACTION_LABELS[action?.status] || ''} ${action?.provider.business_name || ''}?`} onClose={() => setAction(null)}
        footer={<><button className="btn btn-ghost" onClick={() => setAction(null)}>Cancel</button>
          <button className={`btn ${action?.status === 'VERIFIED' ? 'btn-success' : 'btn-danger'}`} onClick={act}>{ACTION_LABELS[action?.status]}</button></>}>
        <Field label={action?.status === 'VERIFIED' ? 'Note (optional)' : 'Reason (shown to the provider)'}>
          {(id) => <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />}
        </Field>
      </Modal>
    </div>
  )
}
