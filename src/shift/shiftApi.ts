// Cliente de /api/shifts (tabla "Turnos"). Nunca lanza: devuelve { ok:false, error } para que la app siga funcionando sin turnos.
export interface Shift { id: string; staffId: string | null; date: string | null; start: string | null; end: string | null; closed: boolean; registeredBy: string; label: string; notes?: string }
export interface Person { staffId: string; name: string; initials: string }
type Res<T> = { ok: true; data: T } | { ok: false; error: string }

async function call<T>(init: RequestInit, qs = ''): Promise<Res<T>> {
  try {
    const r = await fetch('/api/shifts' + qs, init)
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: j?.error || `Error ${r.status}` }
    return { ok: true, data: j as T }
  } catch (e: any) { return { ok: false, error: e?.message || 'Sin conexión' } }
}
const post = <T,>(body: any) => call<T>({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export const getShifts = (date: string) => call<{ shifts: Shift[] }>({ method: 'GET' }, `?date=${date}`)
export const startShifts = (date: string, people: { staffId: string; name: string; initials: string; start: string }[], registeredBy: string) =>
  post<{ shifts: Shift[] }>({ action: 'start', date, people, registeredBy })
export const reopenShifts = (shifts: Shift[], by: string) => post<{ ok: boolean }>({ action: 'reopen', ids: shifts.map(x => x.id), by, notes: Object.fromEntries(shifts.map(x => [x.id, x.notes || ''])) })
export const closeShifts = (rows: { id: string; start: string; end: string; notes?: string }[], by: string) => post<{ ok: boolean }>({ action: 'close', rows, by })
// Ultima linea "Cerrado por X · ..." de la bitacora (para mostrar quien cerro)
export const lastClosedBy = (shifts: Shift[]) => { for (const s of shifts) { const m = [...String(s.notes || '').matchAll(/Cerrado por (.+?) · ([^\n]+)/g)].pop(); if (m) return `${m[1]} · ${m[2]}` } return '' }

// ── helpers de hora (hora local del teléfono) ──
export const fmtTime = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }) : '—'
export const toInput = (iso?: string | Date | null) => {
  const d = iso ? new Date(iso) : new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export const fromInput = (date: string, hm: string) => new Date(`${date}T${hm}:00`).toISOString()
export const hoursText = (startIso?: string | null, endIso?: string | null) => {
  if (!startIso) return '—'
  const ms = (endIso ? new Date(endIso).getTime() : Date.now()) - new Date(startIso).getTime()
  if (!isFinite(ms) || ms < 0) return '—'
  const m = Math.floor(ms / 60000)
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}
