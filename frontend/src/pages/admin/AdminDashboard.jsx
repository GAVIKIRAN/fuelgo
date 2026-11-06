import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState, Loading, PageHeader, StatCard } from '../../components/ui'
import { adminApi } from '../../api'
import { useSocket } from '../../context/SocketContext'
import { useAsync } from '../../hooks/useAsync'
import { STATUS_LABELS, money, shortDate } from '../../utils/format'

const STATUS_COLORS = {
  PENDING: '#f59e0b', ACCEPTED: '#3b82f6', EN_ROUTE: '#6366f1', ARRIVED: '#06b6d4',
  IN_PROGRESS: '#8b5cf6', COMPLETED: '#16a34a', REJECTED: '#ef4444', CANCELLED: '#94a3b8',
}
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const axis = { fill: 'var(--text-2)', fontSize: 12 }

export default function AdminDashboard() {
  const { on } = useSocket()
  const dash = useAsync(() => adminApi.dashboard(), [])

  useEffect(() => on('request:update', () => dash.reload({ silent: true })), [on]) // eslint-disable-line react-hooks/exhaustive-deps

  if (dash.loading) return <Loading />
  if (dash.error) return <ErrorState message={dash.error} onRetry={dash.reload} />
  const d = dash.data
  const t = d.totals
  const perDay = d.requests_per_day.map((x) => ({ ...x, label: shortDate(x.date) }))
  const byStatus = Object.entries(d.requests_by_status).filter(([, v]) => v > 0).map(([k, v]) => ({ name: STATUS_LABELS[k], key: k, value: v }))

  return (
    <div className="stack">
      <PageHeader title="Dashboard" subtitle="Platform overview, updated live" />
      {t.pending_verifications > 0 && (
        <div className="alert alert-warn">
          {t.pending_verifications} provider{t.pending_verifications > 1 ? 's are' : ' is'} awaiting verification. <Link to="/admin/providers?status=PENDING" className="link-btn">Review now</Link>
        </div>
      )}
      <div className="grid grid-4">
        <StatCard label="Total users" value={t.users} icon="users" tone="navy" />
        <StatCard label="Providers" value={t.providers} hint={`${t.verified_providers} verified · ${t.online_providers} online`} icon="shield" tone="amber" />
        <StatCard label="Requests" value={t.requests} hint={`${t.active_requests} active now`} icon="list" />
        <StatCard label="Revenue" value={money(t.revenue)} icon="wallet" tone="green" />
        <StatCard label="Average rating" value={t.avg_rating ? `${t.avg_rating} / 5` : '—'} icon="star" />
        <StatCard label="Open complaints" value={t.open_complaints} icon="message" tone={t.open_complaints ? 'red' : undefined} />
        <StatCard label="Fuel requests" value={d.requests_by_type.fuel} icon="fuel" />
        <StatCard label="Mechanic requests" value={d.requests_by_type.mechanic} icon="wrench" />
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h2>Requests per day (14 days)</h2>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={perDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={axis} />
                <YAxis allowDecimals={false} tick={axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="fuel" stackId="a" fill="#f59e0b" name="Fuel" />
                <Bar dataKey="mechanic" stackId="a" fill="#24407a" name="Mechanic" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2>Requests by status</h2>
          <div className="chart-box">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                  {byStatus.map((s) => <Cell key={s.key} fill={STATUS_COLORS[s.key]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="card">
        <h2>Revenue per day</h2>
        <div className="chart-box">
          <ResponsiveContainer>
            <LineChart data={perDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={axis} />
              <YAxis tick={axis} />
              <Tooltip formatter={(v) => money(v)} contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="revenue" stroke="#16a34a" strokeWidth={2.5} dot={false} name="Revenue" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
