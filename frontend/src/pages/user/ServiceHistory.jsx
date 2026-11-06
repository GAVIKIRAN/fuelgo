import { useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { EmptyState, ErrorState, Loading, PageHeader, Pagination, StatusBadge } from '../../components/ui'
import { requestApi } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { STATUS_LABELS, dateTime, money, serviceTitle } from '../../utils/format'

export default function ServiceHistory() {
  const [filters, setFilters] = useState({ status: '', service_type: '', date_from: '', date_to: '', page: 1 })
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  const list = useAsync(() => requestApi.list({ ...params, per_page: 10 }), [JSON.stringify(params)])
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 })

  return (
    <div>
      <PageHeader title="Service history" subtitle="All your fuel deliveries and mechanic visits." />
      <div className="filters">
        <select value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.service_type} onChange={set('service_type')} aria-label="Service">
          <option value="">All services</option>
          <option value="fuel">Fuel delivery</option>
          <option value="mechanic">Mechanic</option>
        </select>
        <input className="input" type="date" value={filters.date_from} onChange={set('date_from')} aria-label="From date" />
        <input className="input" type="date" value={filters.date_to} onChange={set('date_to')} aria-label="To date" />
        {Object.keys(params).length > 1 && <button className="btn btn-ghost btn-sm" onClick={() => setFilters({ status: '', service_type: '', date_from: '', date_to: '', page: 1 })}>Clear</button>}
      </div>
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.items.length === 0 ? (
        <EmptyState icon="history" title="Nothing here yet" text="No requests match these filters."
          action={<Link to="/app" className="btn btn-primary">Request help</Link>} />
      ) : (
        <>
          <div className="list">
            {list.data.items.map((r) => {
              const unpaid = r.status === 'COMPLETED' && r.payment_status !== 'SUCCESS' && r.payment_status !== 'REFUNDED'
              return (
                <Link key={r.id} to={unpaid ? `/app/requests/${r.id}/pay` : `/app/requests/${r.id}`} className="list-item">
                  <span className={`li-icon ${r.service_type === 'fuel' ? 'fuel' : ''}`}><Icon name={r.service_type === 'fuel' ? 'fuel' : 'wrench'} /></span>
                  <div className="li-main">
                    <div className="li-title">#{r.id} · {serviceTitle(r)}</div>
                    <div className="li-sub">{dateTime(r.created_at)} · {r.provider?.business_name || '—'} · {r.address || r.zone}</div>
                  </div>
                  <div className="li-end">
                    <StatusBadge status={r.status} />
                    <strong className="small">{money(r.final_price ?? r.estimated_price)}</strong>
                    {unpaid && <span className="badge tone-amber">Payment due</span>}
                    {r.status === 'COMPLETED' && !unpaid && !r.has_feedback && <span className="badge tone-blue">Rate</span>}
                  </div>
                </Link>
              )
            })}
          </div>
          <Pagination pagination={list.data.pagination} onPage={(page) => setFilters({ ...filters, page })} />
        </>
      )}
    </div>
  )
}
