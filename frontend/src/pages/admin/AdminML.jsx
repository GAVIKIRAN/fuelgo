import { useState } from 'react'
import toast from 'react-hot-toast'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Icon from '../../components/Icon'
import { ErrorState, Field, Loading, PageHeader, Spinner, StatCard } from '../../components/ui'
import { adminApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { hourLabel } from '../../utils/format'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const tooltipStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const axis = { fill: 'var(--text-2)', fontSize: 12 }

function tomorrow() {
  const d = new Date(Date.now() + 86400000)
  return d.toISOString().slice(0, 10)
}

function Heatmap({ cells }) {
  const max = Math.max(1, ...cells.map((c) => c.count))
  const lookup = Object.fromEntries(cells.map((c) => [`${c.day_of_week}-${c.hour}`, c.count]))
  return (
    <div className="heatmap" role="img" aria-label="Requests by weekday and hour">
      <span />
      {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</span>)}
      {DAYS.map((d, di) => (
        <div key={d} style={{ display: 'contents' }}>
          <span className="hm-label">{d}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const v = lookup[`${di}-${h}`] || 0
            return <span key={h} className="hm-cell" title={`${d} ${hourLabel(h)}: ${v} requests`}
              style={{ background: v ? `rgb(245 158 11 / ${0.12 + 0.88 * (v / max)})` : 'var(--surface-2)' }} />
          })}
        </div>
      ))}
    </div>
  )
}

export default function AdminML() {
  const insights = useAsync(() => adminApi.insights(), [])
  const [form, setForm] = useState({ date: tomorrow(), zone: 'Vijayanagar', fuel_type: 'petrol', weather: 'clear', traffic: '' })
  const [prediction, setPrediction] = useState(null)
  const [predicting, setPredicting] = useState(false)
  const [retraining, setRetraining] = useState(false)

  const predict = async (e) => {
    e?.preventDefault()
    setPredicting(true)
    try {
      setPrediction(await adminApi.predictDemand({ ...form, traffic: form.traffic || undefined }))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setPredicting(false)
    }
  }

  const retrain = async () => {
    setRetraining(true)
    try {
      const summary = await adminApi.retrain()
      toast.success(`Retrained. Best model: ${summary.best_model}`)
      insights.reload({ silent: true })
      if (prediction) predict()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setRetraining(false)
    }
  }

  if (insights.loading) return <Loading text="Loading model insights… (the first load trains the model if needed)" />
  if (insights.error) return <ErrorState message={insights.error} onRetry={insights.reload} />
  const d = insights.data
  const m = d.metrics
  const best = m.models[m.best_model]
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="stack">
      <PageHeader title="ML insights: fuel demand" subtitle={`Trained ${new Date(m.trained_at).toLocaleString('en-IN')} on ${m.n_rows.toLocaleString()} rows (${m.history_rows} real completed orders)`}
        actions={<button className="btn btn-secondary" onClick={retrain} disabled={retraining}>{retraining ? <><Spinner size={16} /> Retraining…</> : <><Icon name="refresh" size={16} /> Retrain model</>}</button>} />

      <div className="grid grid-4">
        <StatCard label="Best model" value={m.best_model} icon="brain" tone="navy" />
        <StatCard label="MAE (litres)" value={best.MAE} hint="Mean absolute error" tone="amber" />
        <StatCard label="RMSE (litres)" value={best.RMSE} hint="Selection metric" />
        <StatCard label="R²" value={best.R2} hint="Variance explained" tone="green" />
      </div>

      <div className="card">
        <h2>7-day demand forecast (all zones)</h2>
        <div className="chart-box">
          <ResponsiveContainer>
            <BarChart data={d.forecast_7_days}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" tick={axis} />
              <YAxis tick={axis} unit=" L" width={70} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v.toLocaleString()} L`} labelFormatter={(l, p) => p?.[0]?.payload?.date || l} />
              <Legend />
              <Bar dataKey="petrol" stackId="f" fill="#E68232" name="Petrol" />
              <Bar dataKey="diesel" stackId="f" fill="#67070B" name="Diesel" />
              <Bar dataKey="cng" stackId="f" fill="#C72A17" name="CNG" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h2>Peak hours (historical)</h2>
          <p className="muted small">Model-predicted peaks: {d.predicted_peak_hours.map(hourLabel).join(', ')}</p>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={d.peak_hours.map((h) => ({ ...h, label: hourLabel(h.hour) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={axis} interval={2} />
                <YAxis allowDecimals={false} tick={axis} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend />
                <Bar dataKey="fuel" stackId="h" fill="#E68232" name="Fuel" />
                <Bar dataKey="mechanic" stackId="h" fill="#67070B" name="Mechanic" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <h2>Weekday × hour heatmap</h2>
          <p className="muted small">Completed requests by time of week (IST).</p>
          <Heatmap cells={d.heatmap} />
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2>Top zones</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Zone</th><th>Requests</th><th>Litres delivered</th><th>Forecast next 7 days</th></tr></thead>
              <tbody>
                {d.top_zones.map((z) => (
                  <tr key={z.zone}>
                    <td><strong>{z.zone}</strong></td>
                    <td>{z.requests}</td>
                    <td>{z.litres.toLocaleString()} L</td>
                    <td>{(d.zone_forecast.find((f) => f.zone === z.zone)?.litres_next_7_days || 0).toLocaleString()} L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Model comparison</h2>
          <div className="table-wrap">
            <table className="table metrics-table">
              <thead><tr><th>Model</th><th>MAE</th><th>RMSE</th><th>R²</th><th>Train time</th></tr></thead>
              <tbody>
                {Object.entries(m.models).map(([name, r]) => (
                  <tr key={name}>
                    <td className={name === m.best_model ? 'best' : ''}>{name}{name === m.best_model ? ' (selected)' : ''}</td>
                    <td>{r.MAE}</td><td>{r.RMSE}</td><td>{r.R2}</td><td>{r.train_seconds}s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>Target: litres demanded per zone, fuel and hour. Features: {m.features.join(', ')}. Selection: {m.selection_metric}.</p>
        </div>
      </div>

      <div className="card">
        <h2>Predict demand</h2>
        <form onSubmit={predict}>
          <div className="grid grid-4" style={{ gap: '0 14px' }}>
            <Field label="Date">{(id) => <input id={id} type="date" value={form.date} onChange={set('date')} required />}</Field>
            <Field label="Zone">{(id) => <select id={id} value={form.zone} onChange={set('zone')}>{d.zones.map((z) => <option key={z}>{z}</option>)}</select>}</Field>
            <Field label="Fuel">{(id) => <select id={id} value={form.fuel_type} onChange={set('fuel_type')}>{d.fuel_types.map((f) => <option key={f}>{f}</option>)}</select>}</Field>
            <Field label="Weather">{(id) => <select id={id} value={form.weather} onChange={set('weather')}>{['clear', 'cloudy', 'rain', 'storm'].map((w) => <option key={w}>{w}</option>)}</select>}</Field>
            <Field label="Traffic">{(id) => <select id={id} value={form.traffic} onChange={set('traffic')}><option value="">Auto (by hour)</option>{['low', 'medium', 'high'].map((t) => <option key={t}>{t}</option>)}</select>}</Field>
          </div>
          <button className="btn btn-primary" disabled={predicting}>{predicting ? <Spinner size={16} /> : 'Predict'}</button>
        </form>
        {prediction && (
          <div style={{ marginTop: 20 }}>
            <div className="grid grid-3">
              <StatCard label="Total demand" value={`${prediction.total_litres.toLocaleString()} L`} tone="amber" />
              <StatCard label="Expected orders" value={prediction.expected_orders} />
              <StatCard label="Peak hour" value={hourLabel(prediction.peak_hour)} tone="navy" />
            </div>
            <div className="chart-box" style={{ marginTop: 14 }}>
              <ResponsiveContainer>
                <LineChart data={prediction.hourly.map((h) => ({ ...h, label: hourLabel(h.hour) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" tick={axis} interval={2} />
                  <YAxis tick={axis} unit=" L" width={60} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} L`} />
                  <Line type="monotone" dataKey="demand_litres" stroke="#E68232" strokeWidth={2.5} dot={false} name="Demand" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
