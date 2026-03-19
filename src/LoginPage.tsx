import { useState } from 'react'
import { useAuth } from './AuthContext'

const TEAL      = '#00BCD4'
const TEAL_DARK = '#0097A7'

export default function LoginPage() {
  const { signInWithGoogle, signInWithEmail } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [mode, setMode]         = useState<'login' | 'email'>('login')

  const handleGoogle = async () => {
    setLoading(true)
    await signInWithGoogle()
    setLoading(false)
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const err = await signInWithEmail(email, password)
    if (err) setError('Credenciales incorrectas. Verifica tu email y contraseña.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: `linear-gradient(145deg, ${TEAL_DARK} 0%, ${TEAL} 60%, #26C6DA 100%)`, fontFamily: 'Poppins, sans-serif' }}>

      {/* Background decoration */}
      <div style={{ position: 'absolute', top: '-80px', right: '-80px', width: '300px', height: '300px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.15) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-60px', left: '-60px', width: '250px', height: '250px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, transparent 70%)', pointerEvents: 'none' }} />

      {/* Logo */}
      <div className="mb-10 text-center relative z-10">
        <h1 className="text-6xl font-[950] text-white tracking-tighter leading-none drop-shadow-lg">
          Shine<span style={{ color: '#FFD700' }}>UP</span>
        </h1>
        <p className="text-white/70 text-[14px] font-semibold mt-2 tracking-widest uppercase">Operations</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm relative z-10 rounded-3xl overflow-hidden shadow-2xl" style={{ background: 'rgba(255,255,255,0.97)' }}>
        <div className="px-7 py-8">
          <p className="font-black text-[20px] mb-1" style={{ color: '#0F172A' }}>Bienvenido</p>
          <p className="text-[13px] font-medium mb-6" style={{ color: '#94A3B8' }}>Ingresa a tu cuenta de ShineUP Ops</p>

          {/* Google Button */}
          <button onClick={handleGoogle} disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-bold text-[14px] mb-4 transition-all active:scale-95 shadow-md"
            style={{ background: '#0F172A', color: 'white', opacity: loading ? 0.7 : 1 }}>
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continuar con Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: '#E2E8F0' }} />
            <span className="text-[12px] font-semibold" style={{ color: '#94A3B8' }}>o</span>
            <div className="flex-1 h-px" style={{ background: '#E2E8F0' }} />
          </div>

          {/* Email form */}
          <form onSubmit={handleEmail} className="space-y-3">
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Correo electrónico" required
              className="w-full px-4 py-3 rounded-2xl text-[13px] font-medium outline-none transition-all"
              style={{ fontFamily: 'Poppins, sans-serif', border: '1.5px solid #E2E8F0', color: '#0F172A', background: '#F8FAFC' }}
            />
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Contraseña" required
              className="w-full px-4 py-3 rounded-2xl text-[13px] font-medium outline-none transition-all"
              style={{ fontFamily: 'Poppins, sans-serif', border: '1.5px solid #E2E8F0', color: '#0F172A', background: '#F8FAFC' }}
            />
            {error && (
              <div className="px-4 py-3 rounded-2xl text-[12px] font-semibold" style={{ background: '#FEE2E2', color: '#EF4444' }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-2xl font-black text-[14px] text-white transition-all active:scale-95 shadow-lg"
              style={{ background: `linear-gradient(135deg, ${TEAL_DARK}, ${TEAL})`, opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <div className="px-7 py-4 text-center" style={{ borderTop: '1px solid #F1F5F9' }}>
          <p className="text-[11px] font-medium" style={{ color: '#94A3B8' }}>
            Solo usuarios invitados pueden acceder.<br />Contacta a tu administrador.
          </p>
        </div>
      </div>

      <p className="text-white/40 text-[11px] font-medium mt-8 relative z-10">
        ShineUP Cleaning Services © 2026
      </p>
    </div>
  )
}
