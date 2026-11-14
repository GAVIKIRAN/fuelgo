import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

function pinIcon(kind, label = '') {
  return L.divIcon({
    className: 'map-pin-wrap',
    html: `<div class="map-pin map-pin-${kind}"><span>${label}</span></div>`,
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -38],
  })
}

const ICONS = {
  me: pinIcon('me'),
  fuel: pinIcon('fuel', 'F'),
  mechanic: pinIcon('mechanic', 'M'),
  provider: pinIcon('provider'),
  customer: pinIcon('customer'),
}

function Recenter({ center, zoom }) {
  const map = useMap()
  const last = useRef(null)
  useEffect(() => {
    if (!center) return
    const key = `${center.lat.toFixed(5)},${center.lng.toFixed(5)}`
    if (last.current !== key) {
      map.setView([center.lat, center.lng], zoom ?? map.getZoom(), { animate: true })
      last.current = key
    }
  }, [center, zoom, map])
  return null
}

function ClickToMove({ onChange }) {
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

/** Draggable location pin with optional provider markers. */
export function LocationPicker({ value, onChange, providers = [], height = 300, recenterKey }) {
  const markerRef = useRef(null)
  const handlers = useMemo(
    () => ({
      dragend() {
        const m = markerRef.current
        if (m) {
          const { lat, lng } = m.getLatLng()
          onChange({ lat, lng })
        }
      },
    }),
    [onChange],
  )
  return (
    <div className="map-box" style={{ height }}>
      <MapContainer center={[value.lat, value.lng]} zoom={14} scrollWheelZoom style={{ height: '100%' }}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <Recenter center={recenterKey ? value : null} zoom={15} />
        <ClickToMove onChange={onChange} />
        <Marker position={[value.lat, value.lng]} draggable eventHandlers={handlers} ref={markerRef} icon={ICONS.me}>
          <Popup>Your location — drag to adjust</Popup>
        </Marker>
        {providers.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={ICONS[p.provider_type] || ICONS.provider}>
            <Popup>
              <strong>{p.business_name}</strong>
              <br />
              {p.distance_km != null && `${p.distance_km} km · ETA ${p.eta_minutes} min`}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

function FitBounds({ points }) {
  const map = useMap()
  const fittedCount = useRef(0)
  useEffect(() => {
    const valid = points.filter(Boolean)
    // fit once per number of known points (e.g. again when the provider position first arrives)
    if (!valid.length || fittedCount.current === valid.length) return
    if (valid.length === 1) map.setView([valid[0].lat, valid[0].lng], 15)
    else map.fitBounds(valid.map((p) => [p.lat, p.lng]), { padding: [48, 48], maxZoom: 16 })
    fittedCount.current = valid.length
  }, [points, map])
  return null
}

/** Live tracking map: moving provider marker + destination with a straight route line. */
export function TrackingMap({ provider, destination, height = 360, providerLabel = 'Provider', destinationLabel = 'You' }) {
  const hasProvider = provider && provider.lat != null
  return (
    <div className="map-box" style={{ height }}>
      <MapContainer center={[destination.lat, destination.lng]} zoom={14} scrollWheelZoom style={{ height: '100%' }}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <FitBounds points={[destination, hasProvider ? provider : null]} />
        <Marker position={[destination.lat, destination.lng]} icon={ICONS.customer}>
          <Popup>{destinationLabel}</Popup>
        </Marker>
        {hasProvider && (
          <>
            <Marker position={[provider.lat, provider.lng]} icon={ICONS.provider}>
              <Popup>{providerLabel}</Popup>
            </Marker>
            <Polyline
              positions={[[provider.lat, provider.lng], [destination.lat, destination.lng]]}
              pathOptions={{ color: '#E68232', weight: 4, dashArray: '8 8' }}
            />
          </>
        )}
      </MapContainer>
    </div>
  )
}
