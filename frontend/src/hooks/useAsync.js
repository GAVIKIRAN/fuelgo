import { useCallback, useEffect, useRef, useState } from 'react'
import { errorMessage } from '../api/client'

/** Run an async loader on mount / when deps change; returns {data, loading, error, reload, setData}. */
export function useAsync(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const mounted = useRef(true)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await loaderRef.current()
      if (mounted.current) setState({ data, loading: false, error: null })
      return data
    } catch (err) {
      if (mounted.current) setState((s) => ({ ...s, loading: false, error: errorMessage(err) }))
      return undefined
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    reload()
    return () => {
      mounted.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }, [])

  return { ...state, reload, setData }
}
