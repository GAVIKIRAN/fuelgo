import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorState, Loading, PageHeader, Pagination, StarRating, StatCard, StatusBadge } from '../../components/ui'
import { providerApi } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { dateTime, money, serviceTitle, shortDate } from '../../utils/format'

export default function Earnings() {
  const [page, setPage] = useState(1)
  const [ratingsPage, setRatingsPage] = useState(1)
  const e = useAsync(() => providerApi.earnings(), [])
  const history = useAsync(() => providerApi.history({ page, per_page: 10 }), [page])
  const ratings = useAsync(() => providerApi.ratings({ page: ratingsPage, per_page: 5 }), [ratingsPage])

  if (e.loading) return <Loading />
  if (e.error) return <ErrorState message={e.error} onRetry={e.reload} />
  const d = e.data
  const chart = d.daily.map((x) => ({ ...x, label: shortDate(x.date) }))

  return (
    <div className="stack">
      <PageHeader title="Earnings" subtitle={`Net of ${d.commission_pct}% platform commission`} />
      <div className="grid grid-4">
        <StatCard label="Today" value={money(d.today)} tone="amber" icon="wallet" />
        <StatCard label="Last 7 days" value={money(d.this_week)} tone="navy" icon="chart" />
        <StatCard label="Last 30 days" value={money(d.this_month)} icon="clock" />
        <StatCard label="All time" value={money(d.total_earnings)} hint={`${d.completed_jobs} jobs · ${d.pending_payments} awaiting payment`} tone="green" icon="check" />
      </div>
      <div className="card">
        <h2>Last 7 days</h2>
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--text-2)', fontSize: 12 }} />
              <Tooltip formatter={(v, n) => (n === 'earnings' ? money(v) : v)} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)' }} />
              <Bar dataKey="earnings" fill="#E68232" radius={[14, 14, 14, 14]} name="earnings" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2>Service history</h2>
          {history.loading ? <Loading /> : history.data?.items.length ? (
            <>
              <div className="list">
                {history.data.items.map((r) => (
                  <div key={r.id} className="list-item">
                    <div className="li-main">
                      <div className="li-title">#{r.id} · {serviceTitle(r)}</div>
                      <div className="li-sub">{dateTime(r.created_at)} · {r.customer_name}</div>
                    </div>
                    <div className="li-end"><StatusBadge status={r.status} /><span className="small">{money(r.final_price ?? r.estimated_price)}</span></div>
                  </div>
                ))}
              </div>
              <Pagination pagination={history.data.pagination} onPage={setPage} />
            </>
          ) : <EmptyState title="No jobs yet" />}
        </div>
        <div className="card">
          <h2>Ratings received</h2>
          <div className="row" style={{ marginBottom: 12 }}>
            <StarRating value={d.rating_avg} readOnly size={20} />
            <strong>{d.rating_count ? d.rating_avg.toFixed(2) : '—'}</strong>
            <span className="muted">({d.rating_count} reviews)</span>
          </div>
          {ratings.data?.items.length ? (
            <>
              <div className="list">
                {ratings.data.items.map((f) => (
                  <div key={f.id} className="list-item" style={{ alignItems: 'flex-start' }}>
                    <div className="li-main">
                      <div className="row" style={{ gap: 6 }}><StarRating value={f.rating} readOnly size={14} /><span className="small muted">{f.customer_name} · {shortDate(f.created_at)}</span></div>
                      {f.comment && <p style={{ margin: '4px 0 0' }}>{f.comment}</p>}
                    </div>
                  </div>
                ))}
              </div>
              <Pagination pagination={ratings.data.pagination} onPage={setRatingsPage} />
            </>
          ) : <p className="muted">No ratings yet.</p>}
        </div>
      </div>
    </div>
  )
}
