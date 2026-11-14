import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ErrorState, Loading, PageHeader, StatCard } from '../../components/ui'
import { adminApi } from '../../api'
import { useSocket } from '../../context/SocketContext'
import { useAsync } from '../../hooks/useAsync'
import { STATUS_LABELS, money, shortDate } from '../../utils/format'

const STATUS_COLORS = {
  PENDING: '#F2B88A', ACCEPTED: '#E68232', EN_ROUTE: '#D4561F', ARRIVED: '#C72A17',
  IN_PROGRESS: '#97190F', COMPLETED: '#67070B', REJECTED: '#8E8985', CANCELLED: '#C9C6C2',
}
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 12 }
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
      <div className="dash-grid">
        <div className="col-3 half-sm"><StatCard featured label="Revenue" num={t.revenue} format={(n) => `₹${Math.round(n).toLocaleString('en-IN')}`} hint="All completed payments" to="/admin/payments" /></div>
        <div className="col-3 half-sm"><StatCard label="Requests" num={t.requests} hint={`${t.active_requests} active now`} to="/admin/requests" /></div>
        <div className="col-3 half-sm"><StatCard label="Providers" num={t.providers} hint={`${t.verified_providers} verified · ${t.online_providers} online`} to="/admin/providers" /></div>
        <div className="col-3 half-sm"><StatCard label="Total users" num={t.users} hint="Registered vehicle owners" to="/admin/users" /></div>
        <div className="col-3 half-sm"><StatCard label="Average rating" value={t.avg_rating ? `${t.avg_rating} / 5` : '—'} icon="star" /></div>
        <div className="col-3 half-sm"><StatCard label="Open complaints" num={t.open_complaints} icon="message" tone={t.open_complaints ? 'red' : undefined} /></div>
        <div className="col-3 half-sm"><StatCard label="Fuel requests" num={d.requests_by_type.fuel} icon="fuel" /></div>
        <div className="col-3 half-sm"><StatCard label="Mechanic requests" num={d.requests_by_type.mechanic} icon="wrench" /></div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h2>Requests per day (14 days)</h2>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={perDay} barCategoryGap="28%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={axis} />
                <YAxis allowDecimals={false} tick={axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="fuel" stackId="a" fill="#E68232" name="Fuel" />
                <Bar dataKey="mechanic" stackId="a" fill="#67070B" name="Mechanic" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2>Requests by status</h2>
          <div className="chart-box">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byStatus} dataKey="value" nameKey="name" innerRadius={66} outerRadius={100} paddingAngle={3} cornerRadius={8} stroke="none">
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
              <Line type="monotone" dataKey="revenue" stroke="#C72A17" strokeWidth={3} dot={false} name="Revenue" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
