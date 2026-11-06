import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import LocationSection from '../../components/LocationSection'
import { Field, PageHeader, PriceBreakdown, Spinner } from '../../components/ui'
import { requestApi, vehicleApi } from '../../api'
import { errorMessage } from '../../api/client'
import { useAsync } from '../../hooks/useAsync'
import { DEFAULT_LOCATION } from '../../hooks/useGeolocation'
import { useCreateRequest } from '../../hooks/useCreateRequest'
import { saveDraft, setPendingPhoto } from '../../utils/draft'
import { PROBLEM_LABELS } from '../../utils/format'

const CATEGORIES = [
  { value: 'flat_tyre', hint: 'Puncture or tyre change' },
  { value: 'battery_jumpstart', hint: "Vehicle won't start" },
  { value: 'engine_trouble', hint: 'Overheating, noises, warning lights' },
  { value: 'towing', hint: 'Needs to go to a garage' },
  { value: 'general', hint: 'Anything else' },
]

export default function NewMechanicRequest() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const sos = params.get('sos') === '1'
  const vehicles = useAsync(() => vehicleApi.list(), [])
  const [vehicleId, setVehicleId] = useState('')
  const [category, setCategory] = useState(sos ? 'general' : '')
  const [description, setDescription] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoError, setPhotoError] = useState('')
  const [location, setLocation] = useState(DEFAULT_LOCATION)
  const [address, setAddress] = useState('')
  const [estimate, setEstimate] = useState(null)
  const [estimateError, setEstimateError] = useState('')
  const [touched, setTouched] = useState(false)
  const { submit, submitting } = useCreateRequest()

  useEffect(() => {
    if (!vehicleId && vehicles.data?.items.length) setVehicleId(String(vehicles.data.items[0].id))
  }, [vehicles.data, vehicleId])

  useEffect(() => {
    if (!category) return undefined
    const t = setTimeout(async () => {
      setEstimateError('')
      try {
        setEstimate(await requestApi.estimate({ service_type: 'mechanic', problem_category: category, lat: location.lat, lng: location.lng }))
      } catch (err) {
        setEstimate(null)
        setEstimateError(errorMessage(err))
      }
    }, 350)
    return () => clearTimeout(t)
  }, [category, location])

  const onPhoto = (e) => {
    const f = e.target.files?.[0]
    setPhotoError('')
    if (!f) return setPhoto(null)
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return setPhotoError('Use a JPG, PNG or WEBP image')
    if (f.size > 8 * 1024 * 1024) return setPhotoError('Image must be under 8 MB')
    setPhoto(f)
  }

  const draft = () => ({
    kind: 'mechanic',
    payload: {
      service_type: 'mechanic', problem_category: category, description: description || undefined,
      lat: location.lat, lng: location.lng, address: address || undefined,
      vehicle_id: vehicleId ? Number(vehicleId) : null,
    },
    summary: PROBLEM_LABELS[category],
  })

  const go = (auto) => {
    setTouched(true)
    if (!category) return
    setPendingPhoto(photo)
    if (auto) submit(draft(), { autoAssign: true })
    else {
      saveDraft(draft())
      navigate('/app/select-provider')
    }
  }

  const noProviders = estimate && !estimate.providers_available
  return (
    <div>
      <PageHeader title={sos ? 'Emergency help' : 'Mechanic assistance'} subtitle="A verified mechanic comes to your location." />
      <div className="split">
        <div className="card">
          <LocationSection location={location} onLocation={setLocation} address={address} onAddress={setAddress} />
        </div>
        <div className="stack">
          <div className="card">
            <h3>What's wrong?</h3>
            <div className="category-grid" role="radiogroup" aria-label="Problem">
              {CATEGORIES.map((c) => (
                <button type="button" key={c.value} role="radio" aria-checked={category === c.value}
                  className={`category ${category === c.value ? 'active' : ''}`} onClick={() => setCategory(c.value)}>
                  <strong>{PROBLEM_LABELS[c.value]}</strong>
                  <span>{c.hint}</span>
                </button>
              ))}
            </div>
            {touched && !category && <p className="field-error" style={{ marginTop: 8 }}>Choose what's wrong</p>}
            <div style={{ marginTop: 14 }}>
              {vehicles.data?.items.length > 0 && (
                <Field label="Vehicle">
                  {(id) => (
                    <select id={id} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                      <option value="">Not listed</option>
                      {vehicles.data.items.map((v) => <option key={v.id} value={v.id}>{v.make} {v.model} · {v.registration_number}</option>)}
                    </select>
                  )}
                </Field>
              )}
              <Field label="Describe the problem" hint={`${description.length}/1000`}>
                {(id) => <textarea id={id} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Front left tyre is flat, no spare in the car" />}
              </Field>
              <Field label="Photo (optional)" error={photoError}>
                {(id) => <input id={id} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPhoto} />}
              </Field>
              {photo && <img src={URL.createObjectURL(photo)} alt="Problem preview" style={{ maxHeight: 140, borderRadius: 8 }} />}
            </div>
          </div>

          <div className="card">
            <h3>Estimate</h3>
            {!category && <p className="muted">Pick a problem to see the estimated charge.</p>}
            {estimateError && <div className="alert alert-error">{estimateError}</div>}
            {noProviders && <div className="alert alert-warn"><Icon name="alert" size={18} /> No mechanics are available near you right now. Please try again shortly.</div>}
            {estimate && category && <PriceBreakdown breakdown={estimate} />}
            {category && <p className="muted small" style={{ marginTop: 8 }}>Parts, if needed, are charged separately by the mechanic.</p>}
            <div className="stack" style={{ gap: 10, marginTop: 14 }}>
              {!sos && (
                <button className="btn btn-primary btn-lg btn-block" disabled={noProviders || submitting} onClick={() => go(false)}>
                  Choose a mechanic <Icon name="chevronRight" />
                </button>
              )}
              <button className={`btn btn-block ${sos ? 'btn-primary btn-lg' : 'btn-secondary'}`} disabled={noProviders || submitting} onClick={() => go(true)}>
                {submitting ? <Spinner size={18} /> : sos ? <><Icon name="alert" /> Send nearest mechanic now</> : 'Auto-assign nearest'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
