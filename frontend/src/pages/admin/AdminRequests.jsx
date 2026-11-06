import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import StatusTimeline from '../../components/StatusTimeline'
import { EmptyState, ErrorState, Loading, Modal, PageHeader, Pagination, PriceBreakdown, StatusBadge } from '../../components/ui'
import { adminApi, requestApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useSocket } from '../../context/SocketContext'
import { useAsync } from '../../hooks/useAsync'
import { STATUS_LABELS, dateTime, money, serviceTitle } from '../../utils/format'

const CANCELLABLE = ['PENDING', 'ACCEPTED', 'EN_ROUTE']

export default function AdminRequests() {
  const { on, connected } = useSocket()
  const [filters, setFilters] = useState({ status: '', service_type: '', active: '', date_from: '', date_to: '', q: '', page: 1 })
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState(null)
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''))
  const list = useAsync(() => adminApi.requests({ ...params, per_page: 15 }), [JSON.stringify(params)])

  useEffect(() => on('request:update', () => list.reload({ silent: true })), [on, JSON.stringify(params)]) // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value, page: 1 })

  const openDetail = async (r) => {
    try {
      setDetail(await requestApi.get(r.id))
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  const cancel = async () => {
    try {
      await adminApi.cancelRequest(detail.id, 'Cancelled by FuelGo support')
      toast.success('Request cancelled')
      setDetail(null)
      list.reload({ silent: true })
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div>
      <PageHeader title="Service requests" subtitle={connected ? 'Live: updates appear automatically' : 'Reconnecting to live updates…'} />
      <form className="filters" onSubmit={(e) => { e.preventDefault(); setFilters({ ...filters, q: query, page: 1 }) }}>
        <input className="input" placeholder="Customer, area or address" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={filters.active} onChange={set('active')} aria-label="Active">
          <option value="">All</option>
          <option value="true">Active only</option>
        </select>
        <select value={filters.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.service_type} onChange={set('service_type')} aria-label="Service">
          <option value="">All services</option>
          <option value="fuel">Fuel</option>
          <option value="mechanic">Mechanic</option>
        </select>
        <input className="input" type="date" value={filters.date_from} onChange={set('date_from')} aria-label="From" />
        <input className="input" type="date" value={filters.date_to} onChange={set('date_to')} aria-label="To" />
        <button className="btn btn-secondary btn-sm">Search</button>
      </form>
      {list.loading ? <Loading /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : list.data.items.length === 0 ? <EmptyState title="No requests match" /> : (
        <>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Service</th><th>Customer</th><th>Provider</th><th>Zone</th><th>Status</th><th>Amount</th><th>Payment</th><th>Created</th></tr></thead>
              <tbody>
                {list.data.items.map((r) => (
                  <tr key={r.id} onClick={() => openDetail(r)} style={{ cursor: 'pointer' }}>
                    <td>{r.id}</td>
                    <td>{serviceTitle(r)}</td>
                    <td>{r.customer_name}</td>
                    <td>{r.provider?.business_name || '—'}</td>
                    <td>{r.zone}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>{money(r.final_price ?? r.estimated_price)}</td>
                    <td>{r.payment_status || '—'}</td>
                    <td>{dateTime(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination pagination={list.data.pagination} onPage={(page) => setFilters({ ...filters, page })} />
        </>
      )}
      <Modal open={Boolean(detail)} title={detail ? `Request #${detail.id}` : ''} onClose={() => setDetail(null)}
        footer={detail && CANCELLABLE.includes(detail.status) ? <button className="btn btn-danger" onClick={cancel}>Cancel request</button> : null}>
        {detail && (
          <>
            <div className="row" style={{ marginBottom: 10 }}><StatusBadge status={detail.status} /><span className="muted">{serviceTitle(detail)}</span></div>
            <div className="receipt" style={{ marginBottom: 14 }}>
              <div className="receipt-row"><span>Customer</span><span>{detail.customer_name} · {detail.customer_phone || '—'}</span></div>
              <div className="receipt-row"><span>Provider</span><span>{detail.provider?.business_name || '—'}</span></div>
              <div className="receipt-row"><span>Address</span><span>{detail.address || detail.zone}</span></div>
              {detail.description && <div className="receipt-row"><span>Problem</span><span>{detail.description}</span></div>}
            </div>
            <PriceBreakdown breakdown={detail.price_breakdown} finalPrice={detail.final_price} />
            <h3 style={{ marginTop: 16 }}>Timeline</h3>
            <StatusTimeline request={detail} />
          </>
        )}
      </Modal>
    </div>
  )
}
