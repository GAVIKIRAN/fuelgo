import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi } from '../api'
import { setLogoutHandler, tokenStore } from '../api/client'

const AuthContext = createContext(null)

export function homePathFor(user) {
  if (!user) return '/login'
  if (user.role === 'admin') return '/admin'
  if (user.role === 'provider') return '/provider'
  return '/app'
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(tokenStore.get()))

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  useEffect(() => {
    setLogoutHandler(logout)
    if (!tokenStore.get()) return
    authApi
      .me()
      .then(setUser)
      .catch(() => logout())
      .finally(() => setLoading(false))
  }, [logout])

  const handleTokens = useCallback((data) => {
    tokenStore.set({ access_token: data.access_token, refresh_token: data.refresh_token })
    setUser(data.user)
    return data.user
  }, [])

  const login = useCallback(async (email, password) => handleTokens(await authApi.login({ email, password })), [handleTokens])
  const register = useCallback(async (payload) => handleTokens(await authApi.register(payload)), [handleTokens])
  const refreshUser = useCallback(async () => {
    const me = await authApi.me()
    setUser(me)
    return me
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser, setUser }),
    [user, loading, login, register, logout, refreshUser],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
