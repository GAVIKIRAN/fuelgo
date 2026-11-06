import { useCallback, useState } from 'react'
import { getPosition } from '../platform'

// Mysuru city centre (Mysore Palace): used when location is unavailable.
export const DEFAULT_LOCATION = { lat: 12.3052, lng: 76.6552 }

/** One-shot location (native GPS in the Android app, browser API on the web). */
export function useGeolocation() {
  const [state, setState] = useState({ position: null, error: null, loading: false })

  const locate = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const position = await getPosition()
      setState({ position, error: null, loading: false })
      return position
    } catch (err) {
      setState({ position: null, loading: false, error: err.message })
      return null
    }
  }, [])

  return { ...state, locate }
}
