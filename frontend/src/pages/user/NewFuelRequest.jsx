import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import LocationSection from '../../components/LocationSection'
import { Field, PageHeader, PriceBreakdown, Segmented, Spinner } from '../../components/ui'
import { requestApi, vehicleApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { DEFAULT_LOCATION } from '../../hooks/useGeolocation'
import { useCreateRequest } from '../../hooks/useCreateRequest'
import { saveDraft } from '../../utils/draft'
import { FUEL_LABELS } from '../../utils/format'

const PRESETS = [2, 5, 10, 20]

export default function NewFuelRequest() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sos = params.get('sos') === '1'
  const vehicles = useAsync(() => vehicleApi.list(), [])
  const [vehicleId, setVehicleId] = useState('')
  const [fuelType, setFuelType] = useState('petrol')
  const [qty, setQty] = useState(5)
  const [location, setLocation] = useState(DEFAULT_LOCATION)
  const [address, setAddress] = useState('')
  const [estimate, setEstimate] = useState(null)
  const [estimating, setEstimating] = useState(false)
  const [estimateError, setEstimateError] = useState('')
  const { submit, submitting } = useCreateRequest()

  const fuelVehicles = useMemo(() => (vehicles.data?.items || []).filter((v) => v.fuel_type !== 'electric'), [vehicles.data])

  // Pre-select the first vehicle
  useEffect(() => {
    if (!vehicleId && fuelVehicles.length) {
      setVehicleId(String(fuelVehicles[0].id))
      setFuelType(fuelVehicles[0].fuel_type)
    }
  }, [fuelVehicles, vehicleId])

  const chooseVehicle = (id) => {
    setVehicleId(id)
    const v = fuelVehicles.find((x) => String(x.id) === id)
    if (v) setFuelType(v.fuel_type)
  }

  // Live price estimate (debounced)
  useEffect(() => {
    const t = setTimeout(async () => {
      setEstimating(true)
      setEstimateError('')
      try {
        setEstimate(await requestApi.estimate({ service_type: 'fuel', fuel_type: fuelType, quantity_litres: qty, lat: location.lat, lng: location.lng }))
      } catch (err) {
        setEstimate(null)
        setEstimateError(errorMessage(err))
      } finally {
        setEstimating(false)
      }
    }, 350)
    return () => clearTimeout(t)
  }, [fuelType, qty, location])

  const selectedVehicle = fuelVehicles.find((v) => String(v.id) === vehicleId)
  const mismatch = selectedVehicle && selectedVehicle.fuel_type !== fuelType

  const draft = () => ({
    kind: 'fuel',
    payload: {
      service_type: 'fuel', fuel_type: fuelType, quantity_litres: qty, lat: location.lat, lng: location.lng,
      address: address || undefined, vehicle_id: vehicleId ? Number(vehicleId) : null,
    },
    summary: `${FUEL_LABELS[fuelType]} · ${qty} L`,
  })

  const chooseProvider = () => {
    saveDraft(draft())
    navigate('/app/select-provider')
  }

  const noProviders = estimate && !estimate.providers_available
  const blocked = mismatch || noProviders || submitting

  return (
    <div>
      <PageHeader title={sos ? 'Emergency fuel' : 'Fuel delivery'} subtitle="Fuel delivered to wherever your vehicle stopped." />
      <div className="split">
        <div className="card">
          <LocationSection location={location} onLocation={setLocation} address={address} onAddress={setAddress} />
        </div>
        <div className="stack">
          <div className="card">
            <h3>Vehicle and fuel</h3>
            {fuelVehicles.length > 0 ? (
              <Field label="Vehicle">
                {(id) => (
                  <select id={id} value={vehicleId} onChange={(e) => chooseVehicle(e.target.value)}>
                    <option value="">Not listed / someone else's vehicle</option>
                    {fuelVehicles.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model} · {v.registration_number}</option>)}
                  </select>
                )}
              </Field>
            ) : (
              <p className="muted small"><Link to="/app/profile">Add a vehicle</Link> to pre-fill this next time.</p>
            )}
            <Field label="Fuel type" error={mismatch ? `This vehicle runs on ${FUEL_LABELS[selectedVehicle.fuel_type]}` : null}>
              <Segmented name="Fuel type" value={fuelType} onChange={setFuelType}
                options={['petrol', 'diesel', 'cng'].map((f) => ({ value: f, label: FUEL_LABELS[f] }))} />
            </Field>
            <Field label="Quantity (litres)">
              {(id) => (
                <>
                  <div className="qty-row">
                    <input id={id} type="range" min={1} max={60} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
                    <span className="qty-value">{qty} L</span>
                  </div>
                  <div className="chips">
                    {PRESETS.map((p) => <button type="button" key={p} className={`chip ${qty === p ? 'active' : ''}`} onClick={() => setQty(p)}>{p} L</button>)}
                  </div>
                </>
              )}
            </Field>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Price estimate</h3>
              {estimating && <Spinner size={16} />}
            </div>
            {estimateError && <div className="alert alert-error">{estimateError}</div>}
            {noProviders && (
              <div className="alert alert-warn"><Icon name="alert" size={18} /> No fuel providers are available near this location right now. Try again in a few minutes, or move the pin if it's in the wrong place.</div>
            )}
            {estimate && <PriceBreakdown breakdown={estimate} />}
            {estimate?.nearest_eta_minutes && <p className="muted small" style={{ marginTop: 10 }}>Nearest provider is about {estimate.nearest_eta_minutes} min away. Final price may vary slightly with distance.</p>}
            <div className="stack" style={{ gap: 10, marginTop: 14 }}>
              {sos ? (
                <button className="btn btn-primary btn-lg btn-block" disabled={blocked} onClick={() => submit(draft(), { autoAssign: true })}>
                  {submitting ? <Spinner size={18} /> : <><Icon name="alert" /> Send nearest provider now</>}
                </button>
              ) : (
                <>
                  <button className="btn btn-primary btn-lg btn-block" disabled={blocked} onClick={chooseProvider}>
                    Choose a provider <Icon name="chevronRight" />
                  </button>
                  <button className="btn btn-secondary btn-block" disabled={blocked} onClick={() => submit(draft(), { autoAssign: true })}>
                    {submitting ? <Spinner size={18} /> : 'Auto-assign nearest'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
