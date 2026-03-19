import { createContext, useContext, useEffect, useState } from 'react'
import { createClient, Session, User } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jpdajjiaukzilrxwcgtx.supabase.co'
const SUPABASE_KEY = 'sb_publishable_lVelTDSvaDDwvSGRLINQ8A_9eSKcZVP'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

interface Profile {
  id: string
  email: string
  role: 'admin' | 'manager' | 'cleaner' | 'client'
  staff_airtable_id: string | null
  full_name: string | null
  initials: string | null
  active: boolean
}

interface AuthContextType {
  user: User | null
  profile: Profile | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  const loadProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error || !data) { setProfile(null); setLoading(false); return }
      if (!data.active) { await supabase.auth.signOut(); return }
      setProfile(data as Profile)
    } catch {}
    finally { setLoading(false) }
  }

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })
  }

  const signInWithEmail = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    return null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null); setProfile(null); setSession(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, signInWithGoogle, signInWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
