import { useEffect, useState } from 'react'
import { Package, Wrench, ScanLine, Check } from 'lucide-react'
import { LAUNDRY_ENABLED, lGet } from '../laundry/api'
import { Equip, setEquipment, getChecked, setChecked, subscribeLoad } from './loadStore'

const TEAL = '#0E7C86'
interface Cl { id: string; propertyId?: string | null; propertyText?: string }

// Caché de la sesión: los kits/herramientas de cada limpieza casi no cambian
const equipCache = new Map<string, Equip[]>()

// Lista de TODO lo asignado hoy: maletas (de lavandería) + kits y herramientas (de las limpiezas)
export default function AssignedLoad({ cleanings, refreshKey, onScan }: { cleanings: Cl[]; refreshKey: number; onScan: () => void }) {
  const [bags, setBags] = useState<any[] | null>(null)
  const [bagErr, setBagErr] = useState('')
  const [equip, setEquip] = useState<Equip[] | null>(null)
  const [checked, setCheckedState] = useState<Set<string>>(getChecked())
  const key = cleanings.map(c => c.id).join(',')

  useEffect(() => subscribeLoad(() => setCheckedState(getChecked())), [])

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
      const failed = res.filter(r => !r.ok).length
      if (!alive) return
      setBags(list)
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
      for (const r of res) for (const e of (r.v || [])) if (e.code && e.code !== 'N/A' && !all.some(x => x.code === e.code)) all.push(e)
      if (alive) { setEqFail(res.filter(r => !r.ok).length); setEquip(all); setEquipment(all) }
    })()
    return () => { alive = false }
  }, [key, retry])

  const loadedBag = (b: any) => b.cycle?.state === 'In Use'
  const missingBags = (bags || []).filter(b => !loadedBag(b)).length
  const missingEq = (equip || []).filter(e => !checked.has(e.code.toUpperCase())).length
  const missing = missingBags + missingEq
  const totBags = (bags || []).length, totEq = (equip || []).length
  const okBags = totBags - missingBags, okEq = totEq - missingEq
  const tot = totBags + totEq, ok = okBags + okEq
  const pct = tot ? Math.round((ok / tot) * 100) : 0

  const chip = (b: any) => {
    const st = b.cycle?.state || b.state || 'sin estado'
    if (st === 'In Use') return { t: 'Cargada ✓', bg: '#E8F8EF', fg: '#15803D' }
    if (st === 'Clean') return { t: 'Lista · falta cargar', bg: '#FEF3C7', fg: '#92400E' }
    return { t: st === 'Dirty' ? 'Sucia' : st, bg: '#F1F5F9', fg: '#475569' }
  }
  const houseOf = (b: any) => (b.properties || []).map((p: any) => p.name).join(' · ') || b.name

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
            <div className="flex-1 rounded-xl px-3 py-2" style={{ background: '#F1F5F9' }}>
              <p className="text-[10px] font-bold uppercase" style={{ color: '#64748B' }}>Maletas</p>
              <p className="text-[15px] font-extrabold" style={{ color: okBags === totBags ? '#15803D' : '#0F172A' }}>{okBags}<span className="text-[12px] font-bold" style={{ color: '#94A3B8' }}> / {totBags}</span></p>
            </div>
            <div className="flex-1 rounded-xl px-3 py-2" style={{ background: '#F1F5F9' }}>
              <p className="text-[10px] font-bold uppercase" style={{ color: '#64748B' }}>Kits y herramientas</p>
              <p className="text-[15px] font-extrabold" style={{ color: okEq === totEq ? '#15803D' : '#0F172A' }}>{okEq}<span className="text-[12px] font-bold" style={{ color: '#94A3B8' }}> / {totEq}</span></p>
            </div>
          </div>
        </div>
      )}

      {/* Maletas */}
      <p className="text-[10px] font-bold uppercase tracking-wide mt-3 mb-1" style={{ color: '#64748B' }}><Package className="inline w-3 h-3 mr-1" />Maletas</p>
      {bags === null ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Cargando…</p>
        : !LAUNDRY_ENABLED ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Lavandería no está conectada.</p>
        : (bags.length === 0 && !bagErr) ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Ninguna casa de hoy tiene maletas asignadas.</p>
        : bags.map(b => { const c = chip(b); return (
          <div key={b.id} className="flex items-center gap-3 py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#E6F6F7', color: TEAL }}><Package className="w-4 h-4" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-[13px] truncate" style={{ color: '#0F172A' }}>{b.code || b.name}{b.qty > 1 ? ` · ${b.qty} maletas` : ''}</p>
              <p className="text-[11px] truncate" style={{ color: '#64748B' }}>{houseOf(b)}</p>
            </div>
            <span className="text-[10.5px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: c.bg, color: c.fg }}>{c.t}</span>
          </div>
        ) })}

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
    </div>
  )
}
