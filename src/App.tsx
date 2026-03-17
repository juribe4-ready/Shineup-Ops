import { useState, useEffect, useMemo } from 'react'
import { Calendar as CalendarIcon, Search, LogOut } from 'lucide-react'
import CleaningChecklist from './components/CleaningChecklist'
import CleaningCard from './components/CleaningCard'

const TEAL      = '#00BCD4'
const TEAL_DARK = '#0097A7'

// ─────────────────────────────────────────────
// TEMPORAL: Auth simulada hasta integrar auth real
// Cuando tengas auth, reemplaza esto con tu sistema
// ─────────────────────────────────────────────
const TEMP_USER = {
  // PON AQUI el Staff record ID de tu usuario de prueba en Airtable
  // Lo encuentras en la tabla Staff de tu base appBwnoxgyIXILe6M
  staffId: 'REEMPLAZA_CON_TU_STAFF_RECORD_ID',
  firstName: 'Juan',
  initials: 'JR',
  email: 'juan@shineup.com',
}

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
  const [cleanings, setCleanings]     = useState<Cleaning[]>([])
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState<string | null>(null)
  const [selectedCleaning, setSelectedCleaning] = useState<any | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  )

  // Reloj en vivo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Cargar limpiezas desde Netlify Function
  useEffect(() => {
    loadCleanings()
  }, [])

  const loadCleanings = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fecha de hoy en Columbus OH
      const now = new Date()
      const columbusDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        

      const res = await fetch(
        `/.netlify/functions/getCleanings?staffId=${TEMP_USER.staffId}&date=${columbusDate}`
      )

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Error al cargar limpiezas')
      }

      const data: Cleaning[] = await res.json()
      setCleanings(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
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
    const percent    = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, inProgress, programmed, percent }
  }, [cleanings])


  if (selectedCleaning) return (
    <CleaningChecklist
      cleaning={selectedCleaning}
      onBack={() => { setSelectedCleaning(null); loadCleanings() }}
    />
  )

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Buenos dias'
    if (h < 18) return 'Buenas tardes'
    return 'Buenas noches'
  }

  const todayLabel = (() => {
    const s = new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  const ringBg = `conic-gradient(#00E676 ${stats.percent}%, rgba(255,255,255,0.28) ${stats.percent}% 100%)`

  return (
    <div className="min-h-screen bg-[#F0F4F8] pb-12">

      {/* HEADER */}
      <header
        className="relative rounded-b-[36px] shadow-xl"
        style={{ background: `linear-gradient(145deg, ${TEAL_DARK} 0%, ${TEAL} 60%, #26C6DA 100%)` }}
      >
        {/* Decorative circle */}
        <div style={{
          position: 'absolute', top: '-40px', right: '-40px',
          width: '180px', height: '180px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.08) 50%, transparent 70%)',
          pointerEvents: 'none', zIndex: 1,
        }} />

        <div className="relative px-5 pt-12 pb-5" style={{ zIndex: 2 }}>

          {/* Top row: logo + avatar */}
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-4xl font-[950] text-white tracking-tighter leading-none drop-shadow-sm">
                Shine<span style={{ color: '#FFD700' }}>UP</span>
              </h1>
              <p className="mt-1 text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {greeting()}, <span className="font-bold text-white">{TEMP_USER.firstName} 👋</span>
              </p>
            </div>

            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%',
                background: ringBg, padding: '3px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <button
                  onClick={() => alert('Logout pendiente - falta integrar auth')}
                  style={{
                    width: '100%', height: '100%', borderRadius: '50%',
                    background: 'rgba(30,160,175,0.85)',
                    border: 'none', color: 'white',
                    fontWeight: 900, fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {TEMP_USER.initials}
                </button>
              </div>
            </div>
          </div>

          {/* Date + time pills */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-semibold"
              style={{ background: 'rgba(0,0,0,0.15)' }}>
              <CalendarIcon className="w-3 h-3 opacity-70" />
              {todayLabel}
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-[11px] font-bold"
              style={{ background: 'rgba(0,0,0,0.20)', fontFamily: 'monospace' }}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-300" />
              </span>
              {currentTime}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {[
              { label: 'Total',       value: stats.total,      color: '#E0F7FA' },
              { label: 'No iniciadas', value: stats.programmed, color: '#FFCCBC' },
              { label: 'Progreso',    value: stats.inProgress, color: '#B2EBF2' },
              { label: 'Terminadas',  value: stats.done,       color: '#FFD700' },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-xl px-2 py-2 flex flex-col items-center"
                style={{ background: 'rgba(255,255,255,0.13)', backdropFilter: 'blur(6px)' }}>
                <span className="text-lg font-[950] leading-none" style={{ color }}>{value}</span>
                <span className="text-[8px] font-semibold mt-0.5 uppercase tracking-wide text-center"
                  style={{ color: 'rgba(255,255,255,0.90)' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar propiedad..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white pl-10 pr-4 py-3 rounded-xl shadow-lg border-none text-slate-800 text-sm font-medium outline-none placeholder:text-slate-300"
            />
          </div>
        </div>
      </header>

      {/* CONTENT */}
      <div className="px-5 pt-7 mx-auto w-full">
        <div className="flex justify-between items-center mb-5">
          <div>
            <h3 className="text-base font-bold text-slate-900 tracking-tight leading-none">Mis Tareas</h3>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {filteredCleanings.length} {filteredCleanings.length === 1 ? 'limpieza' : 'limpiezas'} asignadas
            </p>
          </div>
          <button
            onClick={loadCleanings}
            className="text-xs font-semibold h-8 px-3 bg-white shadow-sm border border-slate-100 rounded-xl"
            style={{ color: TEAL }}
          >
            Actualizar
          </button>
        </div>

        {/* Estados */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-9 h-9 border-[3px] border-slate-100 rounded-full animate-spin"
              style={{ borderTopColor: TEAL }} />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center py-20 text-center gap-3">
            <div className="text-4xl">⚠️</div>
            <p className="font-bold text-slate-700">Error al cargar</p>
            <p className="text-slate-400 text-sm">{error}</p>
            <button
              onClick={loadCleanings}
              className="mt-2 px-6 py-2 rounded-xl text-white text-sm font-bold"
              style={{ background: TEAL }}
            >
              Reintentar
            </button>
          </div>
        ) : filteredCleanings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center"
              style={{ background: `${TEAL}20` }}>
              <CalendarIcon className="w-8 h-8" style={{ color: TEAL }} />
            </div>
            <p className="font-bold text-slate-700 text-base">Sin limpiezas hoy</p>
            <p className="text-slate-400 text-sm mt-1">No hay tareas asignadas para hoy</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCleanings.map(cleaning => (
              <div key={cleaning.id} className="flex">
                <CleaningCard
                  cleaning={cleaning}
                  onClick={() => setSelectedCleaning(cleaning)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
