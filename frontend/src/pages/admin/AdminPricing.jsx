import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ErrorState, Field, Loading, PageHeader, Spinner } from '../../components/ui'
import { adminApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { FUEL_LABELS, dateTime } from '../../utils/format'

export default function AdminPricing() {
  const pricing = useAsync(() => adminApi.pricing(), [])
  const [fuel, setFuel] = useState({})
  const [config, setConfig] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!pricing.data) return
    setFuel(Object.fromEntries(pricing.data.fuel_prices.map((f) => [f.fuel_type, String(f.price_per_litre)])))
    setConfig(Object.fromEntries(pricing.data.config.map((c) => [c.key, String(c.value)])))
  }, [pricing.data])

  if (pricing.loading) return <Loading />
  if (pricing.error) return <ErrorState message={pricing.error} onRetry={pricing.reload} />

  const invalid = [...Object.values(fuel), ...Object.values(config)].some((v) => v === '' || Number.isNaN(Number(v)) || Number(v) < 0)

  const save = async (e) => {
    e.preventDefault()
    if (invalid) return toast.error('All values must be valid non-negative numbers')
    setSaving(true)
    try {
      const data = await adminApi.updatePricing({
        fuel_prices: Object.entries(fuel).map(([fuel_type, v]) => ({ fuel_type, price_per_litre: Number(v) })),
        config: Object.fromEntries(Object.entries(config).map(([k, v]) => [k, Number(v)])),
      })
      pricing.setData(data)
      toast.success('Pricing updated. New estimates use these values immediately.')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save}>
      <PageHeader title="Pricing" subtitle="Fuel prices and service fees used for every estimate"
        actions={<button className="btn btn-primary" disabled={saving || invalid}>{saving ? <Spinner size={16} /> : 'Save changes'}</button>} />
      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h2>Fuel prices (₹ / litre)</h2>
          {pricing.data.fuel_prices.map((f) => (
            <Field key={f.fuel_type} label={FUEL_LABELS[f.fuel_type]} hint={`Last updated ${dateTime(f.updated_at)}`}>
              {(id) => <input id={id} type="number" step="0.01" min="1" value={fuel[f.fuel_type] ?? ''} onChange={(e) => setFuel({ ...fuel, [f.fuel_type]: e.target.value })} />}
            </Field>
          ))}
        </div>
        <div className="card">
          <h2>Fees & charges</h2>
          {pricing.data.config.map((c) => (
            <Field key={c.key} label={c.description || c.key}>
              {(id) => <input id={id} type="number" step="0.01" min="0" value={config[c.key] ?? ''} onChange={(e) => setConfig({ ...config, [c.key]: e.target.value })} />}
            </Field>
          ))}
        </div>
      </div>
    </form>
  )
}
