import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'
import type { Me } from './types'

interface AuthState {
  me: Me | null
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState>({
  me: null,
  loading: true,
  refresh: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    try {
      const data = await api.get<Me>('/auth/me')
      setMe(data)
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    try {
      await api.post('/auth/logout')
      setMe(null)
    } catch (e) { throw e }
  }

  useEffect(() => {
    void refresh()
    const expired = () => setMe(null)
    window.addEventListener('cashbook:expired', expired)
    return () => window.removeEventListener('cashbook:expired', expired)
  }, [])

  return (
    <AuthContext.Provider value={{ me, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
