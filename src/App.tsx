import { useState, useEffect, useMemo } from 'react'
import { Calendar as CalendarIcon, Search, LogOut } from 'lucide-react'
import CleaningCard from './components/CleaningCard'
import CleaningChecklist from './components/CleaningChecklist'
import LoginPage from './LoginPage'
import { useAuth } from './AuthContext'
import { usePushNotifications } from './usePushNotifications'

const TEAL      = '#00BCD4'
const TEAL_DARK = '#0097A7'

interface Cleaning {
  id: string
  propertyText?: string
  address?: string
  status?: string
  date?: string
  formattedDate?: string
  scheduledTime?: string
  notes?: string
  staffList?: string[]
  equipmentCount?: number
  attachments?: Array<{ url: string }>
}

export default function App() {
  const { user, profile, loading, signOut } = useAuth()
  usePushNotifications(user?.id)

  const [cleanings, setCleanings]           = useState<Cleaning[]>([])
  const [loadingData, setLoadingData]       = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [searchQuery, setSearchQuery]       = useState('')
  const [selectedCleaning, setSelectedCleaning] = useState<any | null>(null)
  const [currentTime, setCurrentTime]       = useState(
    new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  )

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (profile?.staff_airtable_id) loadCleanings()
    else if (profile && !profile.staff_airtable_id) setLoadingData(false)
  }, [profile])

  // Deep link: ?cleaning=recXXX opens checklist directly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const cleaningId = params.get('cleaning')
    if (cleaningId && profile?.staff_airtable_id) {
      setSelectedCleaning({ id: cleaningId })
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [profile])

  const loadCleanings = async () => {
    setLoadingData(true)
    setError(null)
    try {
      const columbusDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const res = await fetch(`/api/getCleanings?staffId=${profile!.staff_airtable_id}&date=${columbusDate}`)
      if (!res.ok) throw new Error('Error al cargar limpiezas')
      setCleanings(await res.json())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  const filteredCleanings = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return cleanings.filter(c =>
      String(c.propertyText || '').toLowerCase().includes(q) ||
      String(c.address || '').toLowerCase().includes(q)
    )
  }, [cleanings, searchQuery])

  const stats = useMemo(() => {
    const total      = cleanings.length
    const done       = cleanings.filter(c => c.status === 'Done').length
    const inProgress = cleanings.filter(c => c.status === 'In Progress').length
    const programmed = cleanings.filter(c => c.status === 'Programmed' || c.status === 'Scheduled').length
    const opened     = cleanings.filter(c => c.status === 'Opened').length
    const percent    = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, inProgress, programmed, opened, percent }
  }, [cleanings])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos días'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const todayLabel = (() => {
    const s = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  const ringBg = `conic-gradient(#00E676 ${stats.percent}%, rgba(255,255,255,0.28) ${stats.percent}% 100%)`

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: `linear-gradient(145deg, ${TEAL_DARK}, ${TEAL})` }}>
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  )

  if (!user || !profile) return <LoginPage />

  if (!profile.active) return (
    <div className="min-h-screen flex items-center justify-center px-6"
      style={{ background: `linear-gradient(145deg, ${TEAL_DARK}, ${TEAL})`, fontFamily: 'Poppins, sans-serif' }}>
      <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
        <p className="text-4xl mb-4">🔒</p>
        <p className="font-black text-[18px] text-slate-800 mb-2">Acceso desactivado</p>
        <p className="text-slate-500 text-[13px] mb-6">Tu cuenta ha sido desactivada. Contacta a tu administrador.</p>
        <button onClick={signOut} className="text-[13px] font-bold px-4 py-2 rounded-xl" style={{ background: '#F1F5F9', color: '#64748B' }}>
          Cerrar sesión
        </button>
      </div>
    </div>
  )

  if (selectedCleaning) return (
    <CleaningChecklist
      cleaning={selectedCleaning}
      onBack={() => { setSelectedCleaning(null); loadCleanings() }}
    />
  )

  const displayName = profile.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Usuario'
  const initials = profile.initials || displayName.substring(0, 2).toUpperCase()

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-12" style={{ fontFamily: 'Poppins, sans-serif' }}>
      <header className="relative rounded-b-[36px] shadow-xl"
        style={{ background: `linear-gradient(145deg, ${TEAL_DARK} 0%, ${TEAL} 60%, #26C6DA 100%)` }}>
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 50%, transparent 70%)', pointerEvents: 'none', zIndex: 1 }} />
        <div className="relative px-5 pt-12 pb-5" style={{ zIndex: 2 }}>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-4xl font-[950] text-white tracking-tighter leading-none drop-shadow-sm">
                Shine<span style={{ color: '#FFD700' }}>UP</span>
              </h1>
              <p className="mt-1 text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {greeting()}, <span className="font-bold text-white">{displayName} 👋</span>
              </p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: ringBg, padding: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'rgba(30,160,175,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 900, fontSize: '14px' }}>
                  {initials}
                </div>
              </div>
              <button onClick={signOut} className="flex items-center gap-1 text-white/60 text-[10px] font-semibold active:text-white transition-colors">
                <LogOut className="w-3 h-3" /> Salir
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-semibold" style={{ background: 'rgba(0,0,0,0.15)' }}>
              <CalendarIcon className="w-3 h-3 opacity-70" />{todayLabel}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-bold" style={{ background: 'rgba(0,0,0,0.20)', fontFamily: 'monospace' }}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-300" />
              </span>
              {currentTime}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1 mb-4">
            {[
              { label: 'Total',        value: stats.total,      color: '#E0F7FA' },
              { label: 'No iniciadas', value: stats.programmed, color: '#FFCCBC' },
              { label: 'Abiertas',     value: stats.opened,     color: '#FFF176' },
              { label: 'Progreso',     value: stats.inProgress, color: '#B2EBF2' },
              { label: 'Terminadas',   value: stats.done,       color: '#FFD700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl px-2 py-2 flex flex-col items-center" style={{ background: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(6px)' }}>
                <span className="text-lg font-[950] leading-none" style={{ color }}>{value}</span>
                <span className="text-[8px] font-semibold mt-0.5 uppercase tracking-wide text-center" style={{ color: 'rgba(255,255,255,0.90)' }}>{label}</span>
              </div>
            ))}
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Buscar propiedad..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white pl-10 pr-4 py-3 rounded-xl shadow-lg border-none text-slate-800 text-sm font-medium outline-none placeholder:text-slate-300"
              style={{ fontFamily: 'Poppins, sans-serif' }} />
          </div>
        </div>
      </header>

      <div className="px-5 pt-7 mx-auto w-full">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight leading-none">Mis Tareas</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {filteredCleanings.length} {filteredCleanings.length === 1 ? 'limpieza' : 'limpiezas'} asignadas
            </p>
          </div>
          <button onClick={loadCleanings} className="text-xs font-semibold h-8 px-3 bg-white shadow-sm border border-slate-100 rounded-xl" style={{ color: TEAL }}>
            Actualizar
          </button>
        </div>

        {loadingData ? (
          <div className="flex justify-center py-20">
            <div className="w-9 h-9 border-[3px] border-slate-100 rounded-full animate-spin" style={{ borderTopColor: TEAL }} />
          </div>
        ) : !profile.staff_airtable_id ? (
          <div className="flex flex-col items-center py-20 text-center gap-3">
            <p className="text-4xl">⚙️</p>
            <p className="font-bold text-slate-700">Perfil incompleto</p>
            <p className="text-slate-400 text-sm">Tu cuenta no tiene un Staff ID de Airtable asignado. Contacta al administrador.</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 text-center gap-3">
            <p className="text-4xl">⚠️</p>
            <p className="font-bold text-slate-700">Error al cargar</p>
            <p className="text-slate-400 text-sm">{error}</p>
            <button onClick={loadCleanings} className="mt-2 px-6 py-2 rounded-xl text-white text-sm font-bold" style={{ background: TEAL }}>Reintentar</button>
          </div>
        ) : filteredCleanings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center" style={{ background: `${TEAL}20` }}>
              <CalendarIcon className="w-8 h-8" style={{ color: TEAL }} />
            </div>
            <p className="font-bold text-slate-700 text-base">Sin limpiezas hoy</p>
            <p className="text-slate-400 text-sm mt-1">No hay tareas asignadas para hoy</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCleanings.map(cleaning => (
              <div key={cleaning.id} className="flex">
                <CleaningCard cleaning={cleaning} onClick={() => setSelectedCleaning(cleaning)} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
