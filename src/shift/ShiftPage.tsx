import { useEffect, useState } from 'react'
import { Play, Square, ScanLine, Package, Users, AlertTriangle, Check } from 'lucide-react'
import { Shift, Person, fmtTime, hoursText, toInput, fromInput, closeShifts, reopenShifts, updateShift, lastClosedBy } from './shiftApi'
import { splitShift, fmtH } from './splitTime'
import AssignedLoad from './AssignedLoad'

const TEAL = '#0E7C86'
const card = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16 } as const
const Av = ({ ini, size = 34 }: { ini: string; size?: number }) => (
  <span className="rounded-xl flex items-center justify-center text-white font-black shrink-0" style={{ width: size, height: size, fontSize: size / 2.8, background: '#9C7FE8' }}>{ini}</span>
)

// ── Pase de lista (hoja inferior): se muestra al abrir la 1ª casa o al iniciar el turno a mano ──
export function RollCallSheet({ title, sub, team, busy, confirmLabel, onConfirm, onSkip, onCancel }: {
  title: string; sub: string; team: Person[]; busy: boolean; confirmLabel: string
  onConfirm: (picked: { person: Person; hm: string }[]) => void; onSkip?: () => void; onCancel: () => void
}) {
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(team.map(p => [p.staffId, true])))
  const [hm, setHm] = useState<Record<string, string>>(() => Object.fromEntries(team.map(p => [p.staffId, toInput()])))
  const picked = team.filter(p => on[p.staffId])
  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end" style={{ background: 'rgba(15,23,42,0.5)' }}>
      <div className="rounded-t-[24px] px-4 pt-3 pb-6" style={{ background: '#fff', fontFamily: 'Poppins, sans-serif', maxHeight: '88vh', overflowY: 'auto' }}>
        <div className="mx-auto mb-3 rounded-full" style={{ width: 40, height: 4, background: '#CBD5E1' }} />
        <p className="font-black text-[16px]" style={{ color: '#0F172A' }}>{title}</p>
        <p className="text-[12px] mb-2" style={{ color: '#64748B' }}>{sub}</p>
        {team.map(p => (
          <div key={p.staffId} className="flex items-center gap-3 py-2.5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <Av ini={p.initials} />
            <span className="flex-1 font-bold text-[14px]" style={{ color: '#0F172A' }}>{p.name}</span>
            <input type="time" value={hm[p.staffId]} disabled={!on[p.staffId]} onChange={e => setHm(h => ({ ...h, [p.staffId]: e.target.value }))}
              className="rounded-lg px-2 py-1 text-[13px] font-bold" style={{ background: '#F1F5F9', color: '#0F172A', opacity: on[p.staffId] ? 1 : 0.4 }} />
            <button onClick={() => setOn(o => ({ ...o, [p.staffId]: !o[p.staffId] }))} aria-label="Presente"
              className="rounded-lg flex items-center justify-center" style={{ width: 26, height: 26, background: on[p.staffId] ? TEAL : '#fff', border: `2px solid ${on[p.staffId] ? TEAL : '#CBD5E1'}`, color: '#fff' }}>
              {on[p.staffId] && <Check className="w-4 h-4" />}
            </button>
          </div>
        ))}
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl font-bold text-[13px]" style={{ border: '1.5px solid #E2E8F0', color: '#475569' }}>Cancelar</button>
          <button disabled={busy || !picked.length} onClick={() => onConfirm(picked.map(p => ({ person: p, hm: hm[p.staffId] })))}
            className="flex-[1.6] py-3 rounded-xl font-bold text-[13px] text-white" style={{ background: TEAL, opacity: busy || !picked.length ? 0.5 : 1 }}>{busy ? 'Guardando…' : confirmLabel}</button>
        </div>
        {onSkip && <button onClick={onSkip} className="w-full mt-2 py-2 text-[12px] font-semibold" style={{ color: '#64748B' }}>Ahora no, solo abrir la casa</button>}
      </div>
    </div>
  )
}

// ── Pestaña Turno ──
export function ShiftTab({ date, by, shifts, shiftsError, team, todayCleanings, missing, onAddMissing, onStart, onScanLoad, onClose, onReload, onReopen, refreshKey, onToast }: {
  by: string; onToast: (m: string, t?: 'ok' | 'err') => void
  date: string; shifts: Shift[] | null; shiftsError: string; team: Person[]; missing: Person[]; onAddMissing: () => void
  todayCleanings: { id: string; propertyId?: string | null; propertyText?: string; status?: string; startTime?: string | null; endTime?: string | null; staffIds?: string[] }[]
  onStart: () => void; onScanLoad: () => void; onClose: () => void; onReload: () => void; onReopen: () => void; refreshKey: number
}) {
  const [, tick] = useState(0)
  const [edit, setEdit] = useState<Shift | null>(null)
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t) }, [])
  const nameOf = (id: string | null) => team.find(p => p.staffId === id)
  const open = (shifts || []).filter(s => !s.closed)
  const allClosed = !!shifts && shifts.length > 0 && open.length === 0
  const earliest = open.map(s => s.start).filter(Boolean).sort()[0] || null
  const done = todayCleanings.filter(c => c.status === 'Done').length
  const inProg = todayCleanings.filter(c => c.status === 'In Progress')
  const dateLabel = new Date(date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="px-5 pt-2 pb-4 space-y-3">
      <div>
        <p className="font-black text-[22px]" style={{ color: '#0F172A' }}>Turno</p>
        <p className="text-[12px]" style={{ color: '#64748B' }}>{dateLabel}{!shifts ? '' : shifts.length === 0 ? ' · sin iniciar' : allClosed ? ' · cerrado' : ' · en curso'}</p>
      </div>

      {shifts === null && shiftsError && (
        <div className="p-3 rounded-2xl text-[12px]" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C' }}>
          <b>Turnos no disponibles.</b> Revisa que exista la tabla «Turnos» en Airtable con sus campos.
          <div className="mt-1 font-mono text-[11px] break-all">{shiftsError}</div>
          <button onClick={onReload} className="mt-2 px-3 py-1.5 rounded-lg font-bold text-white" style={{ background: '#B91C1C' }}>Reintentar</button>
        </div>
      )}

      {shifts && shifts.length === 0 && (
        <div className="p-4" style={card}>
          <p className="text-[12.5px]" style={{ color: '#475569' }}>El turno empieza solo al abrir la primera casa. Si empiezas antes (por ejemplo, cargando en la bodega), inícialo aquí.</p>
          <button onClick={onStart} className="w-full mt-3 py-3 rounded-xl font-bold text-[14px] text-white flex items-center justify-center gap-2" style={{ background: TEAL }}><Play className="w-4 h-4" />Iniciar turno ahora</button>
        </div>
      )}

      {shifts && shifts.length > 0 && (
        <>
          {!allClosed && (
            <div className="rounded-2xl p-4" style={{ background: '#0F172A', color: '#fff' }}>
              <p className="text-[11px] flex items-center gap-2" style={{ color: '#94A3B8' }}><span className="inline-block rounded-full" style={{ width: 8, height: 8, background: '#34D399' }} />Turno activo · desde {fmtTime(earliest)}</p>
              <p className="font-black text-[34px] leading-tight">{hoursText(earliest)}</p>
            </div>
          )}
          <div className="p-4" style={card}>
            <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#64748B' }}><Users className="inline w-3 h-3 mr-1" />Equipo · cada quien con su horario</p>
            {shifts.map(s => {
              const p = nameOf(s.staffId)
              const mine = todayCleanings.filter(c => c.startTime && (c.staffIds || []).includes(s.staffId || ''))
              const sp = s.start ? splitShift(new Date(s.start).getTime(), s.end ? new Date(s.end).getTime() : Date.now(), mine.map(c => ({ s: new Date(c.startTime as string).getTime(), e: c.endTime ? new Date(c.endTime).getTime() : Date.now() }))) : null
              return (
                <div key={s.id} className="py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <div className="flex items-center gap-3">
                    <Av ini={p?.initials || '??'} />
                    <span className="flex-1 font-bold text-[14px]" style={{ color: '#0F172A' }}>{p?.name || s.label || 'Persona'}</span>
                    <span className="text-[12px] font-bold px-2 py-1 rounded-lg" style={{ background: '#F1F5F9' }}>{fmtTime(s.start)}</span>
                    <span style={{ color: '#94A3B8' }}>→</span>
                    <span className="text-[12px] font-bold px-2 py-1 rounded-lg" style={{ background: s.end ? '#F1F5F9' : '#E8F8EF', color: s.end ? '#0F172A' : '#15803D' }}>{s.end ? fmtTime(s.end) : 'en turno'}</span>
                  </div>
                  {sp && (
                    <p className="text-[11px] mt-1 ml-[46px]" style={{ color: '#64748B' }}>
                      <b style={{ color: '#0F172A' }}>{fmtH(sp.total)}</b> · 🧹 {fmtH(sp.clean)} limpiando · 🚐 {fmtH(sp.travel)} traslado · ⏸ {fmtH(sp.dead)} muerto
                    </p>
                  )}
                  <div className="ml-[46px] mt-1.5">
                    {s.closed
                      ? <button onClick={() => setEdit(s)} className="text-[12px] font-bold px-3 py-1 rounded-lg" style={{ border: '1.5px solid #CBD5E1', color: '#475569' }}>🔒 Terminó · corregir / reabrir</button>
                      : <button onClick={() => setEdit(s)} className="text-[12px] font-bold px-3 py-1 rounded-lg" style={{ border: '1.5px solid #FCA5A5', color: '#B91C1C' }}>Terminó su turno</button>}
                  </div>
                </div>
              )
            })}
            {!allClosed && missing.length > 0 && <button onClick={onAddMissing} className="mt-2 text-[12px] font-bold" style={{ color: TEAL }}>+ Agregar al turno: {missing.map(m => m.name).join(', ')}</button>}
            {allClosed && <p className="text-[12px] mt-2" style={{ color: '#64748B' }}>Horas: {shifts.map(s => `${nameOf(s.staffId)?.initials || '??'} ${hoursText(s.start, s.end)}`).join(' · ')}</p>}
          </div>
          <div className="p-4" style={card}>
            <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#64748B' }}>Casas de hoy</p>
            <p className="mt-1" style={{ color: '#0F172A' }}><span className="font-black text-[28px] leading-none">{todayCleanings.length}</span> <span className="font-bold text-[13px]" style={{ color: '#475569' }}>{todayCleanings.length === 1 ? 'casa' : 'casas'} hoy · {done} terminadas</span></p>
            {inProg.length > 0 && <p className="text-[12px]" style={{ color: '#64748B' }}>{inProg.length} In Progress: {inProg.map(c => c.propertyText).join(', ')}</p>}
          </div>
        </>
      )}

      {edit && <PersonShiftSheet shift={edit} person={nameOf(edit.staffId)} date={date} by={by} onClose={() => setEdit(null)} onDone={(m) => { setEdit(null); onToast(m); onReload() }} onError={m => onToast(m, 'err')} />}

      {/* Lista de todo lo asignado (maletas, kits, herramientas) + escáner de carga */}
      <AssignedLoad cleanings={todayCleanings} refreshKey={refreshKey} onScan={onScanLoad} />

      {allClosed && shifts && lastClosedBy(shifts) && (
        <p className="text-center text-[12px] font-bold" style={{ color: '#64748B' }}>Cerrado por {lastClosedBy(shifts)}</p>
      )}
      {allClosed && (
        <button onClick={onReopen} className="w-full py-3 rounded-2xl font-bold text-[13px]" style={{ border: '1.5px solid #CBD5E1', color: '#475569' }}>Reabrir turno (si se cerró por error)</button>
      )}
      {shifts && shifts.length > 0 && !allClosed && (
        <button onClick={onClose} className="w-full py-3.5 rounded-2xl font-bold text-[14px] text-white flex items-center justify-center gap-2" style={{ background: '#DC2626' }}><Square className="w-4 h-4" />Cerrar turno</button>
      )}
    </div>
  )
}

// ── Cerrar turno: horas por persona + aviso (no bloquea) ──
export function CloseShiftPage({ date, shifts, team, inProgress, closedBy, onBack, onDone, onToast }: {
  closedBy: string; date: string; shifts: Shift[]; team: Person[]; inProgress: string[]
  onBack: () => void; onDone: () => void; onToast: (m: string, t?: 'ok' | 'err') => void
}) {
  const open = shifts.filter(s => !s.closed)
  const [startHm, setStartHm] = useState<Record<string, string>>(() => Object.fromEntries(open.map(s => [s.id, toInput(s.start)])))
  const [endHm, setEndHm] = useState<Record<string, string>>(() => Object.fromEntries(open.map(s => [s.id, toInput()])))
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const rows = open.map(s => ({ id: s.id, start: fromInput(date, startHm[s.id]), end: fromInput(date, endHm[s.id]), notes: s.notes || '' }))
  const bad = rows.some(r => new Date(r.end) < new Date(r.start))
  const save = async () => {
    setBusy(true)
    const r = await closeShifts(rows, closedBy)
    setBusy(false)
    if (r.ok) { onToast('Turno cerrado ✓'); onDone() } else onToast(`No se pudo cerrar: ${r.error}`, 'err')
  }
  return (
    <div className="min-h-screen pb-28" style={{ background: '#F8FAFC', fontFamily: 'Poppins, sans-serif' }}>
      <div className="mx-auto" style={{ maxWidth: 560 }}>
        <div className="flex items-center gap-3 px-5 pt-5 pb-3">
          <button onClick={onBack} className="text-[22px]" style={{ color: '#64748B' }} aria-label="Volver">‹</button>
          <p className="font-black text-[18px]" style={{ color: '#0F172A' }}>Cerrar turno</p>
        </div>
        <div className="px-5 space-y-3">
          <p className="text-[12px]" style={{ color: '#64748B' }}>Ajusta la entrada y salida de cada quien.</p>
          <div className="p-4" style={card}>
            {open.map(s => {
              const p = team.find(x => x.staffId === s.staffId)
              return (
                <div key={s.id} className="py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <div className="flex items-center gap-3">
                    <Av ini={p?.initials || '??'} />
                    <span className="flex-1 font-bold text-[14px]" style={{ color: '#0F172A' }}>{p?.name || s.label || 'Persona'}</span>
                    <span className="text-[12px] font-bold" style={{ color: '#475569' }}>{hoursText(rows.find(r => r.id === s.id)!.start, rows.find(r => r.id === s.id)!.end)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 ml-[46px]">
                    <input type="time" value={startHm[s.id]} onChange={e => setStartHm(h => ({ ...h, [s.id]: e.target.value }))} className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[13px] font-bold" style={{ background: '#F1F5F9' }} />
                    <span style={{ color: '#94A3B8' }}>→</span>
                    <input type="time" value={endHm[s.id]} onChange={e => setEndHm(h => ({ ...h, [s.id]: e.target.value }))} className="flex-1 min-w-0 rounded-lg px-2 py-1.5 text-[13px] font-bold" style={{ background: '#F1F5F9' }} />
                  </div>
                </div>
              )
            })}
          </div>
          {inProgress.length > 0 && (
            <div className="p-3 rounded-2xl text-[12.5px] flex gap-2" style={{ background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E' }}>
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><span><b>Aviso:</b> {inProgress.join(', ')} sigue(n) en In Progress. Puedes cerrar igual.</span>
            </div>
          )}
          {bad && <p className="text-[12px] font-semibold" style={{ color: '#B91C1C' }}>Hay una salida antes de la entrada. Corrígela para cerrar.</p>}
        </div>
        <div className="fixed left-0 right-0 bottom-0 p-4" style={{ background: 'linear-gradient(transparent, #F8FAFC 40%)' }}>
          <div className="mx-auto" style={{ maxWidth: 560 }}>
            {!confirming ? (
              <button disabled={busy || bad} onClick={() => setConfirming(true)} className="w-full py-3.5 rounded-2xl font-bold text-[14px] text-white flex items-center justify-center gap-2" style={{ background: '#DC2626', opacity: bad ? 0.5 : 1 }}><Square className="w-4 h-4" />Cerrar turno</button>
            ) : (
              <div className="rounded-2xl p-3" style={{ background: '#fff', border: '1.5px solid #FCA5A5' }}>
                <p className="text-[13px] font-bold" style={{ color: '#0F172A' }}>¿Cerrar el turno de {open.length} persona{open.length === 1 ? '' : 's'}?</p>
                <p className="text-[11.5px] mb-2" style={{ color: '#64748B' }}>Queda guardado con las horas de arriba. Si fue un error, se puede reabrir desde la pestaña Turno.</p>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => setConfirming(false)} className="flex-1 py-3 rounded-xl font-bold text-[13px]" style={{ border: '1.5px solid #E2E8F0', color: '#475569' }}>Volver</button>
                  <button disabled={busy} onClick={save} className="flex-[1.5] py-3 rounded-xl font-bold text-[13px] text-white" style={{ background: '#DC2626' }}>{busy ? 'Cerrando…' : 'Sí, cerrar'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


// ── Terminar / corregir / reabrir el turno de UNA persona ──
function PersonShiftSheet({ shift, person, date, by, onClose, onDone, onError }: { shift: Shift; person?: Person; date: string; by: string; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [start, setStart] = useState(toInput(shift.start))
  const [end, setEnd] = useState(toInput(shift.end))
  const [busy, setBusy] = useState(false)
  const bad = new Date(fromInput(date, end)) < new Date(fromInput(date, start))
  const run = async (fn: () => Promise<{ ok: boolean } | { ok: false; error: string } | any>, msg: string) => {
    setBusy(true)
    const r = await fn()
    setBusy(false)
    if (r.ok) onDone(msg); else onError(`No se pudo: ${r.error}`)
  }
  const name = person?.name || shift.label || 'Persona'
  return (
    <div className="fixed inset-0 z-[80] flex flex-col justify-end" style={{ background: 'rgba(15,23,42,0.5)' }}>
      <div className="rounded-t-[24px] px-4 pt-3 pb-6" style={{ background: '#fff', fontFamily: 'Poppins, sans-serif' }}>
        <div className="mx-auto mb-3 rounded-full" style={{ width: 40, height: 4, background: '#CBD5E1' }} />
        <p className="font-black text-[16px]" style={{ color: '#0F172A' }}>{shift.closed ? `Turno de ${name}` : `${name} terminó su turno`}</p>
        <p className="text-[12px] mb-3" style={{ color: '#64748B' }}>{shift.closed ? 'Está bloqueado. Corrige la hora o reábrelo si fue un error.' : 'Confirma la hora de salida.'}</p>
        <div className="flex items-center gap-2">
          <input type="time" value={start} onChange={e => setStart(e.target.value)} className="flex-1 min-w-0 rounded-lg px-2 py-2 text-[14px] font-bold" style={{ background: '#F1F5F9' }} />
          <span style={{ color: '#94A3B8' }}>→</span>
          <input type="time" value={end} onChange={e => setEnd(e.target.value)} className="flex-1 min-w-0 rounded-lg px-2 py-2 text-[14px] font-bold" style={{ background: '#F1F5F9' }} />
        </div>
        {bad && <p className="text-[12px] font-semibold mt-2" style={{ color: '#B91C1C' }}>La salida es antes de la entrada.</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-bold text-[13px]" style={{ border: '1.5px solid #E2E8F0', color: '#475569' }}>Cancelar</button>
          {!shift.closed
            ? <button disabled={busy || bad} onClick={() => run(() => closeShifts([{ id: shift.id, start: fromInput(date, start), end: fromInput(date, end), notes: shift.notes || '' }], by), `${name}: turno terminado ✓`)} className="flex-[1.6] py-3 rounded-xl font-bold text-[13px] text-white" style={{ background: '#DC2626', opacity: busy || bad ? 0.5 : 1 }}>{busy ? 'Guardando…' : 'Terminar turno'}</button>
            : <>
              <button disabled={busy || bad} onClick={() => run(() => updateShift(shift.id, fromInput(date, start), fromInput(date, end)), 'Hora corregida ✓')} className="flex-1 py-3 rounded-xl font-bold text-[13px] text-white" style={{ background: TEAL, opacity: busy || bad ? 0.5 : 1 }}>Guardar hora</button>
              <button disabled={busy} onClick={() => run(() => reopenShifts([shift], by), `${name}: turno reabierto ✓`)} className="flex-1 py-3 rounded-xl font-bold text-[13px]" style={{ border: '1.5px solid #CBD5E1', color: '#475569' }}>Reabrir</button>
            </>}
        </div>
      </div>
    </div>
  )
}
