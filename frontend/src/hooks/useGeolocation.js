import { useCallback, useState } from 'react'

// Mysuru city centre (Mysore Palace) – used when location is unavailable.
export const DEFAULT_LOCATION = { lat: 12.3052, lng: 76.6552 }

const MESSAGES = {
  1: 'Location permission denied. Drag the pin or type your address instead.',
  2: 'Your position is unavailable right now. Drag the pin to where you are.',
  3: 'Getting your location timed out. Drag the pin or try again.',
}

/** One-shot browser geolocation with friendly error messages. */
export function useGeolocation() {
  const [state, setState] = useState({ position: null, error: null, loading: false })

  const locate = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setState({ position: null, loading: false, error: 'This browser does not support location. Drag the pin instead.' })
      return Promise.resolve(null)
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const position = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }
          setState({ position, error: null, loading: false })
          resolve(position)
        },
        (err) => {
          setState({ position: null, loading: false, error: MESSAGES[err.code] || 'Could not get your location.' })
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      )
    })
  }, [])

  return { ...state, locate }
}
