import { useState, useEffect, useMemo, useRef } from 'react'
import { Calendar as CalendarIcon, Search, LogOut, RefreshCw, CalendarDays, ScanLine, Clock } from 'lucide-react'
import CleaningRow, { STATUS_STYLE, normStatus } from './components/CleaningRow'
import CleaningChecklist from './components/CleaningChecklist'
import LoginPage from './LoginPage'
import { useAuth } from './AuthContext'
import { usePushNotifications } from './usePushNotifications'
import LaundryTools from './laundry/LaundryTools'
import { LAUNDRY_ENABLED } from './laundry/api'
import { startOutbox } from './laundry/outbox'
import { ShiftTab, CloseShiftPage, RollCallSheet } from './shift/ShiftPage'
import { Shift, Person, getShifts, startShifts, fromInput, reopenShifts } from './shift/shiftApi'

const TEAL      = '#00BCD4'
const TEAL_DARK = '#0097A7'

interface Cleaning {
  id: string
  propertyText?: string
  propertyId?: string | null
  address?: string
  status?: string
  date?: string
  formattedDate?: string
  scheduledTime?: string
  notes?: string
  staffList?: string[]
  equipmentCount?: number
  attachments?: Array<{ url: string }>
  cleaningType?: string
  staffIds?: string[]
  staffNames?: string[]
}

export default function App() {
  const { user, profile, loading, signOut } = useAuth()
  usePushNotifications(user?.id)

  const [cleanings, setCleanings]           = useState<Cleaning[]>([])
  const [loadingData, setLoadingData]       = useState(true)
  const [error, setError]                   = useState<string | null>(null)
  const [searchQuery, setSearchQuery]       = useState('')
  const [selectedCleaning, setSelectedCleaning] = useState<any | null>(null)
  const [selectedDate, setSelectedDate]       = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  )
  const [statusFilter, setStatusFilter]     = useState<string>('')
  // Turnos
  const [tab, setTab]                       = useState<'agenda' | 'turno'>('agenda')
  const [shifts, setShifts]                 = useState<Shift[] | null>(null)   // null = aún no se sabe / no disponible
  const [shiftsError, setShiftsError]       = useState('')
  const [todayCleanings, setTodayCleanings] = useState<Cleaning[]>([])
  const [rollCall, setRollCall]             = useState<null | { cleaning: any | null; onlyMissing?: boolean }>(null)
  const [rollBusy, setRollBusy]             = useState(false)
  const [rollSkipped, setRollSkipped]       = useState(false)
  const [showClose, setShowClose]           = useState(false)
  const [laundryMode, setLaundryMode]       = useState<null | 'scan' | 'shift' | 'load'>(null)
  const [loadRefresh, setLoadRefresh]       = useState(0)
  const stripRef = useRef<HTMLDivElement>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  // Laundry: reenvía lo que quedó pendiente por falta de señal (también mientras se está en un checklist)
  const [lToast, setLToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  useEffect(() => { if (LAUNDRY_ENABLED && user) return startOutbox() }, [user])
  const laundryToast = (msg: string, type: 'ok' | 'err' = 'ok') => { setLToast({ msg, type }); setTimeout(() => setLToast(null), 3500) }

  // Mantiene el dia seleccionado visible (centrado) en la tira de dias
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-sel="1"]') as HTMLElement | null
    el?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [selectedDate, profile])

  useEffect(() => {
    if (profile?.staff_airtable_id) loadCleanings(selectedDate)
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

  const loadCleanings = async (date?: string) => {
    setLoadingData(true)
    setError(null)
    const dateToLoad = date || selectedDate
    try {
      const res = await fetch(`/api/getCleanings?staffId=${profile!.staff_airtable_id}&date=${dateToLoad}`)
      if (!res.ok) throw new Error('Error al cargar limpiezas')
      const list = await res.json()
      setCleanings(list)
      if (dateToLoad === new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })) setTodayCleanings(list)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingData(false)
    }
  }

  const loadShifts = async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const r = await getShifts(today)
    if (r.ok) { setShifts(r.data.shifts); setShiftsError('') } else { setShifts(null); setShiftsError(r.error) }
  }
  useEffect(() => { if (profile?.staff_airtable_id) loadShifts() }, [profile])

  const filteredCleanings = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return cleanings.filter(c =>
      String(c.propertyText || '').toLowerCase().includes(q) ||
      String(c.address || '').toLowerCase().includes(q)
    )
  }, [cleanings, searchQuery])

  const visibleCleanings = useMemo(
    () => statusFilter ? filteredCleanings.filter(c => normStatus(c.status) === statusFilter) : filteredCleanings,
    [filteredCleanings, statusFilter]
  )

  const stats = useMemo(() => {
    const total      = cleanings.length
    const done       = cleanings.filter(c => c.status === 'Done').length
    const inProgress = cleanings.filter(c => c.status === 'In Progress').length
    const programmed = cleanings.filter(c => c.status === 'Programmed' || c.status === 'Scheduled').length
    const opened     = cleanings.filter(c => c.status === 'Opened').length
    const percent    = total > 0 ? Math.round((done / total) * 100) : 0
    return { total, done, inProgress, programmed, opened, percent }
  }, [cleanings])

  const team: Person[] = useMemo(() => {
    const m = new Map<string, Person>()
    for (const c of todayCleanings) (c.staffIds || []).forEach((id, i) => {
      if (!m.has(id)) m.set(id, { staffId: id, name: c.staffNames?.[i] || c.staffList?.[i] || 'Persona', initials: c.staffList?.[i] || '??' })
    })
    const me = profile?.staff_airtable_id
    if (me) m.set(me, { staffId: me, name: profile?.full_name || m.get(me)?.name || 'Yo', initials: profile?.initials || m.get(me)?.initials || '??' })
    return [...m.values()]
  }, [todayCleanings, profile])

  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

  const navigateDate = (direction: number) => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + direction)
    const newDate = d.toLocaleDateString('en-CA')
    setSelectedDate(newDate)
    loadCleanings(newDate)
  }

  const goToday = () => {
    setSelectedDate(todayStr)
    loadCleanings(todayStr)
  }

  const todayLabel = (() => {
    const d = new Date(selectedDate + 'T12:00:00')
    const s = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()

  const isToday = selectedDate === todayStr

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
      onBack={() => { setSelectedCleaning(null); loadCleanings(selectedDate) }}
      staffId={profile?.staff_airtable_id || undefined}
      shiftClosed={selectedCleaning.date && String(selectedCleaning.date).slice(0, 10) !== todayStr ? true : !!(shifts && shifts.length > 0 && shifts.every(x => x.closed))}
    />
  )

  const toastEl = lToast ? <div className="fixed left-1/2 -translate-x-1/2 top-4 z-[90] px-5 py-3 rounded-2xl text-white text-[13px] font-bold shadow-xl max-w-[90vw] text-center" style={{ background: lToast.type === 'err' ? '#EF4444' : '#0F172A' }}>{lToast.msg}</div> : null

  if (showClose && shifts) return (
    <>
      {toastEl}
      <CloseShiftPage
        closedBy={profile?.full_name || profile?.email || ''}
        date={todayStr} shifts={shifts} team={team}
        inProgress={todayCleanings.filter(c => c.status === 'In Progress').map(c => c.propertyText || 'Casa')}
        onBack={() => setShowClose(false)}
        onDone={() => { setShowClose(false); loadShifts(); loadCleanings(selectedDate) }}
        onToast={laundryToast}
      />
    </>
  )

  // Abrir una limpieza: si es hoy y el turno no ha empezado, primero el pase de lista (nunca bloquea: si falla, igual abre la casa)
  const openCleaning = (c: any) => {
    if (isToday && shifts !== null && shifts.length === 0 && !rollSkipped) setRollCall({ cleaning: c })
    else setSelectedCleaning(c)
  }
  const confirmRoll = async (picked: { person: Person; hm: string }[]) => {
    setRollBusy(true)
    const r = await startShifts(todayStr, picked.map(({ person, hm }) => ({ ...person, start: fromInput(todayStr, hm) })), profile.full_name || profile.email || '')
    setRollBusy(false)
    if (r.ok) { setShifts(r.data.shifts); setShiftsError(''); laundryToast('Turno iniciado ✓') }
    else laundryToast(`No se pudo registrar el turno: ${r.error}`, 'err')
    const target = rollCall?.cleaning
    setRollCall(null)
    if (target) setSelectedCleaning(target)
  }
  const startedIds = new Set((shifts || []).map(x => x.staffId))
  const missingTeam = team.filter(p => !startedIds.has(p.staffId))
  const rollTeam = rollCall?.onlyMissing ? missingTeam : team

  const displayName = profile.full_name?.split(' ')[0] || user.email?.split('@')[0] || 'Usuario'
  const initials = profile.initials || displayName.substring(0, 2).toUpperCase()

  const TEALN = '#0E7C86'
  const stripDays = Array.from({ length: 15 }, (_, k) => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + (k - 7))
    const iso = d.toLocaleDateString('en-CA')
    const wd = d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')
    return { iso, num: d.getDate(), wd: wd.charAt(0).toUpperCase() + wd.slice(1, 2) }
  })
  const monthLabel = (() => {
    const m = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
    return m.charAt(0).toUpperCase() + m.slice(1)
  })()
  const pickDate = (iso: string) => { setSelectedDate(iso); setStatusFilter(''); loadCleanings(iso) }
  const STATUS_ORDER = ['Done', 'In Progress', 'Opened', 'Programmed'] as const
  const countOf: Record<string, number> = { Programmed: stats.programmed, Opened: stats.opened, 'In Progress': stats.inProgress, Done: stats.done }
  const summaryLabel = isToday ? `Hoy · ${todayLabel.toLowerCase()}` : todayLabel

  return (
    <div className="min-h-screen pb-28" style={{ background: '#F8FAFC', fontFamily: 'Poppins, sans-serif' }}>
      <div className="mx-auto w-full" style={{ maxWidth: 1100 }}>
        {/* Barra superior */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-[24px] font-[900] tracking-tight leading-none" style={{ color: '#0F172A' }}>
              Shine<span style={{ color: TEALN }}>UP</span>
            </h1>
            <span className="text-[12px] font-semibold" style={{ color: '#64748B' }}>Ops</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={signOut} className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ color: '#64748B' }}>
              <LogOut className="w-3.5 h-3.5" /> Salir
            </button>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[12px] font-black" style={{ background: TEALN }}>{initials}</div>
          </div>
        </div>

        {toastEl}
        <div className="px-5"><LaundryTools hideButtons forceMode={laundryMode} onModeClose={() => setLaundryMode(null)} onToast={laundryToast} cleanings={todayCleanings} onChanged={() => setLoadRefresh(n => n + 1)} /></div>

        <div className="px-5" style={{ display: tab === 'agenda' ? 'block' : 'none' }}>
          {/* Calendario fijo: se queda arriba mientras se hace scroll */}
          <div className="sticky top-0 z-30 -mx-5 px-5 pt-2 pb-1" style={{ background: '#F8FAFC', paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="font-bold text-[15px]" style={{ color: '#0F172A' }}>{monthLabel}</p>
            <div className="flex items-center gap-2">
              {!isToday && (
                <button onClick={() => { setStatusFilter(''); goToday() }} className="h-8 px-3 rounded-full text-[12px] font-bold" style={{ background: '#E6F6F7', color: TEALN }}>Hoy</button>
              )}
              <button onClick={() => loadCleanings()} aria-label="Actualizar" className="w-8 h-8 rounded-xl flex items-center justify-center bg-white active:scale-90 transition-all" style={{ border: '1px solid #E2E8F0', color: TEALN }}>
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <div className="relative w-8 h-8 rounded-xl flex items-center justify-center bg-white" style={{ border: '1px solid #E2E8F0', color: TEALN }}>
                <CalendarIcon className="w-4 h-4" />
                <input ref={dateInputRef} type="date" value={selectedDate} aria-label="Elegir fecha"
                  onChange={e => { if (e.target.value) pickDate(e.target.value) }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
              </div>
            </div>
          </div>

          {/* Tira de dias (se desliza) */}
          <div ref={stripRef} className="flex gap-2 overflow-x-auto pb-2 -mx-5 px-5" style={{ scrollbarWidth: 'none' }}>
            {stripDays.map(d => {
              const sel = d.iso === selectedDate
              const tod = d.iso === todayStr
              return (
                <button key={d.iso} data-sel={sel ? '1' : undefined} onClick={() => !sel && pickDate(d.iso)}
                  className="shrink-0 flex flex-col items-center justify-center rounded-2xl"
                  style={{ width: 46, height: 62, background: sel ? TEALN : '#fff', color: sel ? '#fff' : '#0F172A', border: sel ? 'none' : '1px solid #E2E8F0' }}>
                  <span className="text-[10px] font-semibold" style={{ opacity: sel ? 0.85 : 0.55 }}>{d.wd}</span>
                  <span className="text-[17px] font-extrabold leading-tight">{d.num}</span>
                  <span className="w-1 h-1 rounded-full mt-0.5" style={{ background: tod ? (sel ? '#fff' : TEALN) : 'transparent' }} />
                </button>
              )
            })}
          </div>

          </div>

          {/* Resumen del dia: barra + pills de estado (filtran) */}
          {!loadingData && !error && cleanings.length > 0 && (
            <div className="rounded-2xl bg-white p-3 mt-1 mb-3" style={{ border: '1px solid #E2E8F0' }}>
              <div className="flex items-end gap-3 mb-2.5">
                <div className="leading-none">
                  <span className="font-black text-[34px]" style={{ color: '#0F172A' }}>{stats.total}</span>
                  <span className="text-[13px] font-bold ml-1.5" style={{ color: '#475569' }}>{stats.total === 1 ? 'casa' : 'casas'} {isToday ? 'hoy' : 'ese día'}</span>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-[12px] font-bold" style={{ color: '#0F172A' }}>{stats.done} terminadas · {stats.percent}%</p>
                  <p className="text-[10.5px]" style={{ color: '#94A3B8' }}>{summaryLabel}</p>
                </div>
              </div>
              <div className="flex overflow-hidden rounded-full mb-2.5" style={{ height: 10, background: '#EEF2F6' }}>
                {(['Done', 'In Progress', 'Opened', 'Programmed'] as const).map(k => countOf[k] > 0 && (
                  <div key={k} title={`${k} ${countOf[k]}`} style={{ width: `${(countOf[k] / Math.max(1, stats.total)) * 100}%`, background: STATUS_STYLE[k].dot, transition: 'width .4s' }} />
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {STATUS_ORDER.filter(k => countOf[k] > 0).map(k => {
                  const on = statusFilter === k
                  return (
                    <button key={k} onClick={() => setStatusFilter(on ? '' : k)}
                      className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full"
                      style={on ? { background: '#0F172A', color: '#fff' } : { background: '#fff', border: '1px solid #E2E8F0', color: '#334155' }}>
                      <i style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_STYLE[k].dot, display: 'inline-block' }} />
                      {k} <b>{countOf[k]}</b>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Buscar */}
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Buscar propiedad..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-white pl-10 pr-4 py-2.5 rounded-xl text-slate-800 text-sm font-medium outline-none placeholder:text-slate-300"
              style={{ fontFamily: 'Poppins, sans-serif', border: '1px solid #E2E8F0' }} />
          </div>

          {loadingData ? (
            <div className="flex justify-center py-20">
              <div className="w-9 h-9 border-[3px] border-slate-100 rounded-full animate-spin" style={{ borderTopColor: TEALN }} />
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
              <button onClick={() => loadCleanings()} className="mt-2 px-6 py-2 rounded-xl text-white text-sm font-bold" style={{ background: TEALN }}>Reintentar</button>
            </div>
          ) : visibleCleanings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center" style={{ background: '#E6F6F7' }}>
                <CalendarIcon className="w-8 h-8" style={{ color: TEALN }} />
              </div>
              <p className="font-bold text-slate-700 text-base">{statusFilter ? `Sin limpiezas ${statusFilter}` : isToday ? 'Sin limpiezas hoy' : 'Sin limpiezas este día'}</p>
              <p className="text-slate-400 text-sm mt-1">{statusFilter ? 'Toca el estado otra vez para ver todas' : 'No hay tareas asignadas'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {visibleCleanings.map(cleaning => (
                <CleaningRow key={cleaning.id} cleaning={cleaning} onClick={() => openCleaning(cleaning)} />
              ))}
            </div>
          )}
        </div>

        {tab === 'turno' && (
          <ShiftTab
            date={todayStr} shifts={shifts} shiftsError={shiftsError} team={team} todayCleanings={todayCleanings}
            missing={missingTeam}
            onStart={() => setRollCall({ cleaning: null })}
            onAddMissing={() => setRollCall({ cleaning: null, onlyMissing: true })}
            onScanLoad={() => setLaundryMode('load')}
            refreshKey={loadRefresh}
            onReopen={async () => { const r = await reopenShifts(shifts || [], profile.full_name || profile.email || ''); if (r.ok) { laundryToast('Turno reabierto ✓'); loadShifts() } else laundryToast(`No se pudo reabrir: ${r.error}`, 'err') }}
            onClose={() => setShowClose(true)}
            onReload={loadShifts}
          />
        )}
      </div>

      {rollCall && (
        <RollCallSheet
          title={rollCall.cleaning ? `Abrir ${rollCall.cleaning.propertyText || 'la casa'}` : rollCall.onlyMissing ? 'Agregar al turno' : 'Iniciar turno'}
          sub={rollCall.cleaning ? 'Al abrir esta casa empieza el turno. Confirma quién está aquí (los asignados a las casas de hoy).' : 'Confirma quién está presente y a qué hora empezó.'}
          team={rollTeam} busy={rollBusy}
          confirmLabel={rollCall.cleaning ? 'Abrir turno y casa' : rollCall.onlyMissing ? 'Agregar' : 'Iniciar turno'}
          onConfirm={confirmRoll}
          onSkip={rollCall.cleaning ? () => { const c = rollCall.cleaning; setRollSkipped(true); setRollCall(null); setSelectedCleaning(c) } : undefined}
          onCancel={() => setRollCall(null)}
        />
      )}

      {/* Barra inferior: Mi agenda · Escanear · Turno */}
      <nav className="fixed left-0 right-0 bottom-0 z-50 bg-white" style={{ borderTop: '1px solid #E2E8F0', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex items-center" style={{ maxWidth: 560, height: 64 }}>
          <button onClick={() => setTab('agenda')} className="flex-1 flex flex-col items-center gap-0.5 text-[11px] font-semibold" style={{ color: tab === 'agenda' ? TEALN : '#94A3B8' }}>
            <CalendarDays className="w-[22px] h-[22px]" />Mi agenda
          </button>
          <div className="flex-1 flex justify-center">
            {LAUNDRY_ENABLED && (
              <button onClick={() => setLaundryMode('scan')} aria-label="Escanear" className="rounded-full flex items-center justify-center text-white shadow-lg active:scale-95 transition-all" style={{ width: 56, height: 56, marginTop: -22, background: TEALN, border: '4px solid #fff' }}>
                <ScanLine className="w-6 h-6" />
              </button>
            )}
          </div>
          <button onClick={() => setTab('turno')} className="flex-1 flex flex-col items-center gap-0.5 text-[11px] font-semibold" style={{ color: tab === 'turno' ? TEALN : '#94A3B8' }}>
            <Clock className="w-[22px] h-[22px]" />Turno
          </button>
        </div>
      </nav>
    </div>
  )
}
