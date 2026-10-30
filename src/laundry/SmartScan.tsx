import { useState } from 'react'
import { lGet } from './api'
import { submit } from './outbox'
import Scanner from './Scanner'
import { Big, L, Modal } from './ui'
import { findEquipment, setChecked } from '../shift/loadStore'

interface Cl { id: string; propertyId?: string | null; propertyText?: string; status?: string }
type Card = { kind: 'bag'; code: string; info: any } | { kind: 'equip'; text: string; code: string }
const TEAL = '#0E7C86'

// Escáner universal. Dos formas de usarlo:
//  · 'ask'  (botón central): al escanear muestra la tarjeta (contenido + estado) y PREGUNTA qué hacer.
//  · 'load' (Cargar transporte): el contexto es claro, así que carga directo lo que escaneas.
export default function SmartScan({ mode, cleanings, onClose, onToast, onChanged }: {
  mode: 'ask' | 'load'; cleanings: Cl[]; onClose: () => void; onToast: (m: string, t?: 'ok' | 'err') => void; onChanged: () => void
}) {
  const [card, setCard] = useState<Card | null>(null)
  const [pick, setPick] = useState<Cl[] | null>(null)
  const [log, setLog] = useState<{ code: string; msg: string; ok: boolean }[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [manual, setManual] = useState('')
  const push = (code: string, msg: string, ok = true) => setLog(l => [{ code, msg, ok }, ...l].slice(0, 8))

  const stateOf = (info: any): string | null => info?.cycle?.state || info?.bag?.state || null

  async function loadBag(code: string) {
    setBusy(true)
    try {
      const r = await submit<{ loaded: { code: string; warning: string | null }[]; unknown: string[] }>('loadShift', { codes: [code] })
      if (r.status === 'queued') { push(code, 'Sin señal: se enviará sola'); onToast('Sin señal: la carga se enviará sola') }
      else {
        const w = r.data.loaded.find(x => x.warning)?.warning
        if (r.data.unknown.length) { push(code, 'Código desconocido', false); onToast(`No conozco el código ${code}`, 'err') }
        else if (w) { push(code, w, false); onToast(`⚠ ${code}: ${w}`, 'err') }
        else { push(code, 'Cargada al transporte ✓'); onToast(`${code} cargada ✓`) }
      }
      onChanged(); setCard(null)
    } catch (e: any) { setErr(e.message); onToast(e.message, 'err') } finally { setBusy(false) }
  }

  async function markDirty(info: any, cleaning: Cl) {
    setBusy(true)
    try {
      const r = await submit('declareReturn', { cleaningId: cleaning.id, bagId: info.bag.id, units: [{ unit: 1, status: 'dirty' }], condition: 'Normal', short: [] })
      onToast(r.status === 'queued' ? 'Sin señal: se enviará sola' : `${info.bag.code || info.bag.name} marcada sucia ✓`)
      onChanged(); setCard(null); setPick(null)
    } catch (e: any) { setErr(e.message); onToast(e.message, 'err') } finally { setBusy(false) }
  }

  function startMarkDirty(info: any) {
    const ids = new Set((info.bag.properties || []).map((p: any) => p.id))
    const cands = cleanings.filter(c => c.propertyId && ids.has(c.propertyId))
    if ((info.bag.qty || 1) > 1) { onToast('Esta maleta tiene varias unidades: márcala dentro de la casa, pestaña Cierre', 'err'); return }
    if (!cands.length) { onToast('Ninguna limpieza de hoy usa esta maleta. Márcala desde la casa (pestaña Cierre)', 'err'); return }
    const open = cands.filter(c => c.status === 'In Progress')
    const list = open.length ? open : cands
    if (list.length === 1) markDirty(info, list[0]); else setPick(list)
  }

  async function handle(raw: string) {
    const code = raw.trim().toUpperCase()
    if (!code || busy) return
    setErr(''); setPick(null)
    const eq = findEquipment(code)
    if (eq) {
      setChecked(eq.code, true); onChanged()
      if (mode === 'ask') setCard({ kind: 'equip', text: eq.text, code: eq.code }); else push(code, `${eq.text} cargado ✓`)
      return
    }
    try {
      const info = await lGet<any>('bag', { code })
      if (mode === 'load') {
        const st = stateOf(info)
        if (st === 'In Use') push(code, 'Ya estaba cargada')
        else if (st && st !== 'Clean') { push(code, `Estado ${st}: todavía no está lista`, false); onToast(`${code}: estado ${st}, no está lista`, 'err') }
        else await loadBag(code)
      } else setCard({ kind: 'bag', code, info })
    } catch (e: any) { setErr(e.message) }
  }

  const bagCard = (c: Extract<Card, { kind: 'bag' }>) => {
    const info = c.info; const st = stateOf(info)
    const useFinal = st === 'Clean' && info.cycle?.finalContent?.counts
    const counts: Record<string, number> = useFinal ? info.cycle.finalContent.counts : (info.bag.standard || {})
    const houses = (info.bag.properties || []).map((p: any) => p.name).join(' · ')
    const chip = st === 'Clean' ? { t: 'Clean · lista, sin cargar', bg: '#E8F8EF', fg: '#15803D' }
      : st === 'In Use' ? { t: 'In Use · cargada en el transporte', bg: '#E5EEFF', fg: '#1D4ED8' }
      : st === 'Dirty' ? { t: 'Dirty · ya está sucia', bg: '#FEF3C7', fg: '#92400E' }
      : { t: `${st || 'Sin estado'}`, bg: '#F1F5F9', fg: '#475569' }
    return (
      <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1.5px solid ${TEAL}` }}>
        <p className="text-[11px]" style={{ color: L.slate }}>Maleta{houses ? ` · ${houses}` : ''}{info.unit ? ` · unidad ${info.unit}` : ''}</p>
        <p className="font-black text-[17px]" style={{ color: L.ink }}>{info.bag.code || info.bag.name}</p>
        <p className="text-[11px] font-semibold mt-2" style={{ color: L.slate }}>{useFinal ? 'Contenido (lo que dejó lavandería)' : 'Total de la casa (regresa sucio por defecto)'}</p>
        <div>{Object.entries(counts).map(([k, v]) => (
          <div key={k} className="flex justify-between text-[13px] py-1" style={{ borderTop: '1px solid #F1F5F9' }}><span>{k}</span><b>{v}</b></div>
        ))}{!Object.keys(counts).length && <p className="text-[12px]" style={{ color: L.muted }}>Esta maleta no tiene contenido definido.</p>}</div>
        <div className="mt-3 rounded-xl px-3 py-2.5 text-[13px] font-bold" style={{ background: chip.bg, color: chip.fg }}>● {chip.t}</div>
        {pick && (
          <div className="mt-3">
            <p className="text-[12px] font-semibold mb-1" style={{ color: L.slate }}>¿De cuál casa sale?</p>
            {pick.map(p => <button key={p.id} disabled={busy} onClick={() => markDirty(info, p)} className="w-full text-left py-2.5 px-3 mb-1.5 rounded-xl font-bold text-[13px]" style={{ border: `1.5px solid ${L.border}`, color: L.ink }}>{p.propertyText}</button>)}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <div className="flex-1"><Big ghost color={L.slate} onClick={() => { setCard(null); setPick(null) }}>Cancelar</Big></div>
          {(st === 'Clean' || !st) && <div className="flex-[2]"><Big color={TEAL} disabled={busy} onClick={() => loadBag(c.code)}>Cargar al transporte</Big></div>}
          {st === 'In Use' && <div className="flex-[2]"><Big color={TEAL} disabled={busy} onClick={() => startMarkDirty(info)}>Marcar sucia</Big></div>}
        </div>
      </div>
    )
  }

  return (
    <Modal title={mode === 'load' ? 'Cargar transporte' : 'Escanear'} onClose={onClose}>
      {mode === 'load' && <p className="text-[12px]" style={{ color: L.slate }}>Cada maleta, kit o herramienta que escanees se carga directo.</p>}
      <Scanner onCode={handle} paused={!!card || busy} />
      <div className="flex gap-2">
        <input value={manual} onChange={e => setManual(e.target.value)} placeholder="¿No lee? Escribe el código…" onKeyDown={e => { if (e.key === 'Enter') { handle(manual); setManual('') } }}
          className="flex-1 rounded-xl px-3 py-2.5 text-[14px] outline-none" style={{ border: `1.5px dashed ${L.border}`, background: '#fff' }} />
        <button onClick={() => { handle(manual); setManual('') }} className="px-4 rounded-xl font-bold text-[13px] text-white" style={{ background: TEAL }}>Agregar</button>
      </div>
      {err && <p className="text-[12px] font-semibold" style={{ color: L.red }}>{err}</p>}
      {card?.kind === 'bag' && bagCard(card)}
      {card?.kind === 'equip' && (
        <div className="rounded-2xl p-4" style={{ background: '#fff', border: `1.5px solid #7C3AED` }}>
          <p className="text-[11px]" style={{ color: L.slate }}>Kit / herramienta</p>
          <p className="font-black text-[16px]" style={{ color: L.ink }}>{card.text}</p>
          <p className="text-[12px]" style={{ color: '#7C3AED' }}>{card.code}</p>
          <div className="mt-2 rounded-xl px-3 py-2.5 text-[13px] font-bold" style={{ background: '#E8F8EF', color: '#15803D' }}>✓ Marcada como cargada en el transporte</div>
          <div className="mt-3"><Big ghost color={L.slate} onClick={() => { setChecked(card.code, false); onChanged(); setCard(null) }}>Deshacer</Big></div>
        </div>
      )}
      {mode === 'load' && log.length > 0 && (
        <div className="rounded-2xl p-3" style={{ background: '#fff', border: `1px solid ${L.border}` }}>
          {log.map((l, i) => <p key={i} className="text-[12px] py-0.5" style={{ color: l.ok ? '#15803D' : '#B45309' }}><b>{l.code}</b> · {l.msg}</p>)}
        </div>
      )}
    </Modal>
  )
}
