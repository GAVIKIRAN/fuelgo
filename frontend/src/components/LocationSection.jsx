import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { LocationPicker } from './Maps'
import { Field, Spinner } from './ui'
import { useGeolocation } from '../hooks/useGeolocation'

async function reverseGeocode({ lat, lng }) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.display_name?.split(',').slice(0, 4).join(',').trim() || null
  } catch {
    return null
  }
}

/** GPS + draggable pin + manual address fallback. */
export default function LocationSection({ location, onLocation, address, onAddress, providers }) {
  const { locate, loading, error } = useGeolocation()
  const [recenter, setRecenter] = useState(0)
  const [geocoding, setGeocoding] = useState(false)
  const addressTouched = useRef(Boolean(address))
  const asked = useRef(false)

  const fillAddress = useCallback(async (pos) => {
    if (addressTouched.current) return
    setGeocoding(true)
    const text = await reverseGeocode(pos)
    setGeocoding(false)
    if (text && !addressTouched.current) onAddress(text)
  }, [onAddress])

  const useGps = useCallback(async () => {
    const pos = await locate()
    if (pos) {
      onLocation({ lat: pos.lat, lng: pos.lng })
      setRecenter((n) => n + 1)
      fillAddress(pos)
    }
  }, [locate, onLocation, fillAddress])

  useEffect(() => {
    if (!asked.current) {
      asked.current = true
      useGps()
    }
  }, [useGps])

  const onPinMove = (pos) => {
    onLocation(pos)
    fillAddress(pos)
  }

  return (
    <div>
      <div className="row-between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Your location</h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={useGps} disabled={loading}>
          {loading ? <Spinner size={14} /> : <Icon name="crosshair" size={16} />} Use my location
        </button>
      </div>
      {error && <div className="alert alert-warn" role="alert"><Icon name="alert" size={18} /> {error}</div>}
      <LocationPicker value={location} onChange={onPinMove} providers={providers} recenterKey={recenter} height={280} />
      <p className="muted small" style={{ margin: '6px 0 12px' }}>
        Drag the blue pin or tap the map to set exactly where you are. {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
      </p>
      <Field label="Address / landmark" hint={geocoding ? 'Looking up address…' : 'Helps the provider find you faster'}>
        {(id) => (
          <input id={id} value={address} placeholder="e.g. Near Kukkarahalli lake gate, Saraswathipuram"
            onChange={(e) => { addressTouched.current = true; onAddress(e.target.value) }} />
        )}
      </Field>
    </div>
  )
}
