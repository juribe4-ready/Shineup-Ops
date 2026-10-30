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

  // Maletas por casa de hoy
  useEffect(() => {
    if (!LAUNDRY_ENABLED) { setBags([]); return }
    let alive = true
    const props = [...new Set(cleanings.map(c => c.propertyId).filter(Boolean) as string[])]
    if (!props.length) { setBags([]); return }
    ;(async () => {
      try {
        const res = await Promise.all(props.map(p => lGet<{ bags: any[] }>('bagsByProperty', { propertyId: p }).then(r => r.bags)))
        const seen = new Set<string>(); const list: any[] = []
        for (const b of res.flat()) if (!seen.has(b.id)) { seen.add(b.id); list.push(b) }
        if (alive) { setBags(list); setBagErr('') }
      } catch (e: any) { if (alive) { setBags([]); setBagErr(e.message || 'No pude leer las maletas') } }
    })()
    return () => { alive = false }
  }, [key, refreshKey])

  // Kits y herramientas (equipamiento) de las limpiezas de hoy
  useEffect(() => {
    let alive = true
    ;(async () => {
      const all: Equip[] = []
      await Promise.all(cleanings.map(async c => {
        let list = equipCache.get(c.id)
        if (!list) {
          try {
            const r = await fetch(`/api/getCleaningTasks?cleaningId=${c.id}`)
            if (r.ok) { const j = await r.json(); list = (j?.cleaning?.equipment || []).map((e: any) => ({ code: String(e.code || ''), text: String(e.text || '') })); equipCache.set(c.id, list!) }
          } catch { /* sin datos de esta casa */ }
        }
        for (const e of list || []) if (e.code && e.code !== 'N/A' && !all.some(x => x.code === e.code)) all.push(e)
      }))
      if (alive) { setEquip(all); setEquipment(all) }
    })()
    return () => { alive = false }
  }, [key])

  const loadedBag = (b: any) => b.cycle?.state === 'In Use'
  const missingBags = (bags || []).filter(b => !loadedBag(b)).length
  const missingEq = (equip || []).filter(e => !checked.has(e.code.toUpperCase())).length
  const missing = missingBags + missingEq

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
        {(bags !== null && equip !== null) && (
          <span className="ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full" style={missing ? { background: '#FEF3C7', color: '#92400E' } : { background: '#E8F8EF', color: '#15803D' }}>
            {missing ? `falta ${missing}` : 'todo cargado ✓'}
          </span>
        )}
      </div>
      <p className="text-[12px] mb-1" style={{ color: '#64748B' }}>Lo asignado a tus casas de hoy. Escanea para cargarlo.</p>

      {/* Maletas */}
      <p className="text-[10px] font-bold uppercase tracking-wide mt-3 mb-1" style={{ color: '#64748B' }}><Package className="inline w-3 h-3 mr-1" />Maletas</p>
      {bags === null ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Cargando…</p>
        : !LAUNDRY_ENABLED ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Lavandería no está conectada.</p>
        : bagErr ? <p className="text-[12px]" style={{ color: '#B91C1C' }}>{bagErr}</p>
        : bags.length === 0 ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Ninguna casa de hoy tiene maletas asignadas.</p>
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
        : equip.length === 0 ? <p className="text-[12px]" style={{ color: '#94A3B8' }}>Tus casas de hoy no tienen equipamiento asignado.</p>
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
