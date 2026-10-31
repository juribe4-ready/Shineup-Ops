import { useEffect, useState } from 'react'
import { Package, Wrench, ScanLine, Check } from 'lucide-react'
import { LAUNDRY_ENABLED, lGet, lPost } from '../laundry/api'
import { Equip, setEquipment, getEquipment, getChecked, setChecked, subscribeLoad, setUnits, getUnits, unitCodesOf, unitIsLoaded, BagUnit } from './loadStore'
import { Modal, Big, L } from '../laundry/ui'

const TEAL = '#0E7C86'
interface Cl { id: string; propertyId?: string | null; propertyText?: string; status?: string }

// Caché de la sesión: los kits/herramientas de cada limpieza casi no cambian
const equipCache = new Map<string, Equip[]>()

// Lista de TODO lo asignado hoy: maletas (de lavandería) + kits y herramientas (de las limpiezas)
export default function AssignedLoad({ cleanings, refreshKey, onScan }: { cleanings: Cl[]; refreshKey: number; onScan: () => void }) {
  const [bags, setBags] = useState<any[] | null>(null)
  const [bagErr, setBagErr] = useState('')
  const [equip, setEquip] = useState<Equip[] | null>(null)
  const [checked, setCheckedState] = useState<Set<string>>(getChecked())
  const [units, setUnitsState] = useState<BagUnit[]>(getUnits())
  const [info, setInfo] = useState<BagUnit | null>(null)
  const [undoOpen, setUndoOpen] = useState(false)
  const key = cleanings.map(c => c.id).join(',')

  useEffect(() => subscribeLoad(() => { setCheckedState(getChecked()); setUnitsState(getUnits()) }), [])

  // Pool con concurrencia limitada + reintentos (Airtable limita ~5 consultas/seg: 14 casas en paralelo daba error 429)
  const pool = async <T,>(items: string[], n: number, fn: (x: string) => Promise<T>) => {
    const out: { item: string; ok: boolean; v?: T }[] = []
    let i = 0
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const item = items[i++]
        let ok = false, v: T | undefined
        for (let t = 0; t < 4 && !ok; t++) {
          try { v = await fn(item); ok = true } catch { await new Promise(r => setTimeout(r, 500 * (t + 1))) }
        }
        out.push({ item, ok, v })
      }
    }))
    return out
  }
  const [retry, setRetry] = useState(0)
  const [eqFail, setEqFail] = useState(0)

  // Maletas por casa de hoy
  useEffect(() => {
    if (!LAUNDRY_ENABLED) { setBags([]); return }
    let alive = true
    const props = [...new Set(cleanings.map(c => c.propertyId).filter(Boolean) as string[])]
    if (!props.length) { setBags([]); return }
    ;(async () => {
      const res = await pool(props, 3, p => lGet<{ bags: any[] }>('bagsByProperty', { propertyId: p }).then(r => r.bags))
      const seen = new Set<string>(); const list: any[] = []
      for (const r of res) for (const b of (r.v || [])) if (!seen.has(b.id)) { seen.add(b.id); list.push(b) }
      // una fila por maleta física
      const us: BagUnit[] = []
      for (const r of res) for (const b of (r.v || [])) {
        if (us.some(u => u.bagId === b.id)) continue
        const house = (b.properties || []).filter((p: any) => props.includes(p.id)).map((p: any) => p.name).join(' · ') || b.name
        const opened = cleanings.some(c => c.propertyId && (b.properties || []).some((p: any) => p.id === c.propertyId) && (c.status === 'In Progress' || c.status === 'Done'))
        unitCodesOf(b).forEach((code, i) => us.push({ code, bagId: b.id, propertyId: r.item, house, n: i + 1, of: Math.max(1, b.qty || 1), loaded: unitIsLoaded(b.cycle, i + 1), state: b.cycle?.state || b.state || null, opened, dirtyAt: b.cycle?.dirtyAt || null, stay: !!(b.cycle?.unitsBack || []).find((x: any) => x.unit === i + 1 && x.status === 'stay') }))
      }
      const failed = res.filter(r => !r.ok).length
      if (!alive) return
      setBags(list); setUnits(us)
      setBagErr(failed ? `No pude leer las maletas de ${failed} casa${failed > 1 ? 's' : ''} (Airtable está saturado).` : '')
    })()
    return () => { alive = false }
  }, [key, refreshKey, retry])

  // Kits y herramientas (equipamiento) de las limpiezas de hoy
  useEffect(() => {
    let alive = true
    ;(async () => {
      const all: Equip[] = []
      const ids = cleanings.map(c => c.id)
      const res = await pool(ids, 4, async id => {
        const cached = equipCache.get(id)
        if (cached) return cached
        const r = await fetch(`/api/getCleaningTasks?cleaningId=${id}`)
        if (!r.ok) throw new Error(String(r.status))
        const j = await r.json()
        const list: Equip[] = (j?.cleaning?.equipment || []).map((e: any) => ({ code: String(e.code || ''), text: String(e.text || '') }))
        equipCache.set(id, list)
        return list
      })
      res.forEach((r, i) => { for (const e of (r.v || [])) {
        if (!e.code || e.code === 'N/A') continue
        const ex = all.find(x => x.code === e.code)
        if (ex) ex.cids = [...new Set([...(ex.cids || []), ids[i]])]
        else all.push({ ...e, cids: [ids[i]] })
      } })
      if (alive) { setEqFail(res.filter(r => !r.ok).length); setEquip(all); setEquipment(all) }
    })()
    return () => { alive = false }
  }, [key, retry])

  const missingBags = units.filter(u => !u.loaded).length
  const missingEq = (equip || []).filter(e => !checked.has(e.code.toUpperCase())).length
  const missing = missingBags + missingEq
  const totBags = units.length, totEq = (equip || []).length
  const okBags = totBags - missingBags, okEq = totEq - missingEq
  const tot = totBags + totEq, ok = okBags + okEq
  const pct = tot ? Math.round((ok / tot) * 100) : 0
  // casas: cuántas ya tienen TODAS sus maletas cargadas
  const houses = [...new Set(units.map(u => u.propertyId))]
  const housesOk = houses.filter(h => units.filter(u => u.propertyId === h).every(u => u.loaded)).length

  const chip = (u: BagUnit) => {
    if (u.loaded) return { t: 'Cargada ✓', bg: '#E8F8EF', fg: '#15803D' }
    if (u.state === 'Clean' || u.state === 'In Use') return u.opened ? { t: 'Casa abierta · sin escanear', bg: '#FEE2E2', fg: '#B91C1C' } : { t: 'Lista · falta cargar', bg: '#FEF3C7', fg: '#92400E' }
    if (u.state === 'Dirty' && u.stay) return { t: 'Se quedó en la casa', bg: '#F1F5F9', fg: '#475569' }
    if (u.state === 'Dirty' && u.dirtyAt) {
      const et = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      const days = Math.round((Date.parse(et(new Date())) - Date.parse(et(new Date(u.dirtyAt)))) / 86400000)
      return { t: `Sucia · usada ${days <= 0 ? 'hoy' : days === 1 ? 'ayer' : `hace ${days} días`}, sin lavar`, bg: '#F1F5F9', fg: '#475569' }
    }
    return { t: u.state === 'Dirty' ? 'Sucia · aún no lista' : (u.state || 'sin estado'), bg: '#F1F5F9', fg: '#475569' }
  }

  return (
    <div className="p-4" style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 16 }}>
      <div className="flex items-center">
        <p className="font-bold text-[14px]" style={{ color: '#0F172A' }}>Cargar transporte</p>
        {(bags !== null && equip !== null && !bagErr && !eqFail) && (
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full" style={missing ? { background: '#FEF3C7', color: '#92400E' } : { background: '#E8F8EF', color: '#15803D' }}>
            {missing ? `falta ${missing}` : 'todo cargado ✓'}
          </span>
        )}
      </div>
      <p className="text-[12px] mb-1" style={{ color: '#64748B' }}>Lo asignado a tus casas de hoy. Escanea para cargarlo.</p>

      {(bagErr || eqFail > 0) && (
        <div className="mt-2 p-3 rounded-xl text-[12px]" style={{ background: '#FEF2F2', color: '#B91C1C' }}>
          <p className="font-bold">No se pudo leer todo{eqFail ? ` (${eqFail} casa${eqFail > 1 ? 's' : ''} sin equipo)` : ''}.</p>
          <p>{bagErr || 'Los totales pueden estar incompletos.'}</p>
          <button onClick={() => setRetry(x => x + 1)} className="mt-2 px-3 py-1.5 rounded-lg font-bold text-white" style={{ background: '#DC2626' }}>Reintentar</button>
        </div>
      )}
      {(bags !== null && equip !== null && tot > 0 && !bagErr && !eqFail) && (
        <div className="mt-2 mb-1">
          <div className="flex items-baseline justify-between">
            <p className="text-[13px] font-extrabold" style={{ color: '#0F172A' }}>Cargado {ok} de {tot}</p>
            <p className="text-[12px] font-bold" style={{ color: ok === tot ? '#15803D' : '#64748B' }}>{pct}%</p>
          </div>
          <div className="h-2 rounded-full overflow-hidden mt-1" style={{ background: '#E2E8F0' }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: ok === tot ? '#16A34A' : TEAL }} />
          </div>
          <div className="flex gap-2 mt-2">
            {([['Casas listas', housesOk, houses.length], ['Maletas', okBags, totBags], ['Kits y herr.', okEq, totEq]] as const).map(([lab, a2, t2]) => (
              <div key={lab} className="flex-1 rounded-xl px-2.5 py-2" style={{ background: '#F1F5F9' }}>
                <p className="text-[10px] font-bold uppercase" style={{ color: '#64748B' }}>{lab}</p>
                <p className="text-[15px] font-extrabold" style={{ color: a2 === t2 ? '#15803D' : '#0F172A' }}>{a2}<span className="text-[12px] font-bold" style={{ color: '#94A3B8' }}> / {t2}</span></p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maletas */}
      <p className="text-[10px] font-bold uppercase tracking-wide mt-3 mb-1" style={{ color: '#64748B' }}><Package className="inline w-3 h-3 mr-1" />Maletas · toca una para ver qué contiene</p>
      {bags === null ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Cargando…</p>
        : !LAUNDRY_ENABLED ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Lavandería no está conectada.</p>
        : (units.length === 0 && !bagErr) ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Ninguna casa de hoy tiene maletas asignadas.</p>
        : units.map(u => { const c = chip(u); return (
          <button key={u.code} onClick={() => setInfo(u)} className="w-full flex items-center gap-3 py-2 text-left" style={{ borderTop: '1px solid #F1F5F9' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#E6F6F7', color: TEAL }}><Package className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[13px] truncate" style={{ color: '#0F172A' }}>{u.house}</p>
              <p className="text-[11px] truncate" style={{ color: '#64748B' }}>{u.code}{u.of > 1 ? ` · maleta ${u.n} de ${u.of}` : ''}</p>
            </div>
            <span className="text-[10.5px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: c.bg, color: c.fg }}>{c.t}</span>
          </button>
        ) })}

      {units.some(u => u.loaded) && (
        <button onClick={() => setUndoOpen(true)} className="w-full mt-2 py-2.5 rounded-xl font-bold text-[13px]" style={{ border: '1.5px solid #FCA5A5', color: '#B91C1C', background: '#FEF2F2' }}>
          ↩ Borrar carga ({units.filter(u => u.loaded).length} maletas cargadas)
        </button>
      )}

      {/* Kits y herramientas */}
      <p className="text-[10px] font-bold uppercase tracking-wide mt-3 mb-1" style={{ color: '#64748B' }}><Wrench className="inline w-3 h-3 mr-1" />Kits y herramientas</p>
      {equip === null ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Cargando…</p>
        : (equip.length === 0 && !eqFail) ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Tus casas de hoy no tienen equipamiento asignado.</p>
        : equip.map(e => { const on = checked.has(e.code.toUpperCase()); return (
          <button key={e.code} onClick={() => setChecked(e.code, !on)} className="w-full flex items-center gap-3 py-2 text-left" style={{ borderTop: '1px solid #F1F5F9' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F3F0FF', color: '#7C3AED' }}><Wrench className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[13px] truncate" style={{ color: '#0F172A' }}>{e.text}</p>
              <p className="text-[11px]" style={{ color: '#7C3AED' }}>{e.code}</p>
            </div>
            <span className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 24, height: 24, background: on ? TEAL : '#fff', border: `2px solid ${on ? TEAL : '#CBD5E1'}`, color: '#fff' }}>{on && <Check className="w-4 h-4" />}</span>
          </button>
        ) })}
      {equip && equip.length > 0 && <p className="text-[10.5px] mt-1" style={{ color: '#94A3B8' }}>Estas marcas se guardan en este teléfono, solo por hoy.</p>}

      <button onClick={onScan} className="w-full mt-3 py-2.5 rounded-xl font-bold text-[13px] flex items-center justify-center gap-2" style={{ border: `1.5px solid ${TEAL}`, color: TEAL }}>
        <ScanLine className="w-4 h-4" />Escanear carga
      </button>
      {info && <BagContents unit={info} onClose={() => setInfo(null)} />}
      {undoOpen && <UndoLoad units={units} onClose={() => setUndoOpen(false)} onDone={() => { setUndoOpen(false); setRetry(x => x + 1) }} />}
    </div>
  )
}


// Qué mandó lavandería en esa maleta (contenido final si está Clean; si no, el estándar de la casa)
function BagContents({ unit, onClose }: { unit: BagUnit; onClose: () => void }) {
  const [data, setData] = useState<any | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { lGet<any>('bag', { code: unit.code }).then(setData).catch(e => setErr(e.message || 'No pude leer la maleta')) }, [unit.code])
  const st = data?.cycle?.state || data?.bag?.state || unit.state
  const useFinal = st === 'Clean' && data?.cycle?.finalContent?.counts
  const counts: Record<string, number> = data ? (useFinal ? data.cycle.finalContent.counts : (data.bag?.standard || {})) : {}
  return (
    <Modal title={unit.house} onClose={onClose}>
      <p className="text-[12px]" style={{ color: L.slate }}>{unit.code}{unit.of > 1 ? ` · maleta ${unit.n} de ${unit.of}` : ''} · estado <b>{st || 'sin estado'}</b></p>
      {!data && !err && <p className="text-[12px]" style={{ color: L.muted }}>Cargando…</p>}
      {err && <p className="text-[12px] font-semibold" style={{ color: L.red }}>{err}</p>}
      {data && (
        <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1px solid ${L.border}` }}>
          <p className="text-[11px] font-semibold" style={{ color: L.slate }}>{useFinal ? 'Lo que mandó lavandería' : 'Total de la casa (aún sin confirmar por lavandería)'}</p>
          {Object.entries(counts).map(([k, v]) => <div key={k} className="flex justify-between text-[13px] py-1" style={{ borderTop: '1px solid #F1F5F9' }}><span>{k}</span><b>{v}</b></div>)}
          {!Object.keys(counts).length && <p className="text-[12px]" style={{ color: L.muted }}>Esta maleta no tiene contenido definido.</p>}
        </div>
      )}
    </Modal>
  )
}


// Borrar la carga de casas ya cargadas (vuelven a «Clean» para poder cargarlas de nuevo). Solo deshace lo cargado y sin devolver.
function UndoLoad({ units, onClose, onDone }: { units: BagUnit[]; onClose: () => void; onDone: () => void }) {
  const houses = [...new Map(units.filter(u => u.loaded).map(u => [u.bagId, u])).values()]
  const [sel, setSel] = useState<Set<string>>(new Set(houses.map(h => h.bagId)))
  const [kits, setKits] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const go = async () => {
    setBusy(true); setMsg('')
    const fails: string[] = []
    for (const h of houses.filter(x => sel.has(x.bagId))) {
      try { await lPost('undoLoad', { bagId: h.bagId }) } catch (e: any) { fails.push(`${h.house}: ${e.message || 'error'}`) }
    }
    if (kits) getEquipment().forEach(e => setChecked(e.code, false))
    setBusy(false)
    if (fails.length) setMsg(fails.join(' · ')); else onDone()
  }
  return (
    <Modal title="Borrar carga" onClose={onClose}
      footer={<Big color={L.red} disabled={busy || (!sel.size && !kits)} onClick={go}>{busy ? 'Borrando…' : `Borrar carga de ${sel.size} casa${sel.size === 1 ? '' : 's'}`}</Big>}>
      <p className="text-[12px]" style={{ color: L.slate }}>Las casas elegidas vuelven a «lista para cargar» y podrás escanearlas de nuevo. No afecta las que ya se devolvieron sucias.</p>
      {houses.map(h => {
        const on = sel.has(h.bagId)
        return (
          <button key={h.bagId} onClick={() => setSel(s => { const n = new Set(s); on ? n.delete(h.bagId) : n.add(h.bagId); return n })} className="w-full flex items-center gap-3 py-2 text-left" style={{ borderTop: '1px solid #F1F5F9' }}>
            <span className="rounded-lg flex items-center justify-center shrink-0" style={{ width: 24, height: 24, background: on ? L.red : '#fff', border: `2px solid ${on ? L.red : '#CBD5E1'}`, color: '#fff' }}>{on && <Check className="w-4 h-4" />}</span>
            <span className="flex-1 font-bold text-[13px] truncate" style={{ color: L.ink }}>{h.house}</span>
            <span className="text-[11px]" style={{ color: L.muted }}>{units.filter(u => u.bagId === h.bagId && u.loaded).length} cargadas</span>
          </button>
        )
      })}
      <label className="flex items-center gap-2 text-[12px] font-semibold mt-1" style={{ color: L.slate }}><input type="checkbox" checked={kits} onChange={e => setKits(e.target.checked)} /> Desmarcar también los kits y herramientas</label>
      {msg && <p className="text-[12px] font-semibold" style={{ color: L.red }}>{msg}</p>}
    </Modal>
  )
}
