import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { lGet, lPost, LAUNDRY_ENABLED } from './api'
import { submit } from './outbox'
import { Big, BlobPhotos, Counter, L, Modal } from './ui'

type UnitStatus = 'dirty' | 'clean' | 'stay'
interface PBag {
  id: string; code: string | null; name: string; qty: number; state: string | null; standard: Record<string, number>
  cycle: { id: string; state: string | null; unitsOut: number[]; bagsOut: number | null } | null; declaredForThisCleaning: boolean
}
interface Payload { bags: PBag[]; items: string[] }
export interface BagsPanelHandle { ensureDeclared: () => Promise<boolean> }
interface Props { cleaningId: string; propertyId?: string; isInProgress: boolean; onToast: (msg: string, type?: 'ok' | 'err') => void }

const TAGS = ['Manchas', 'Pelos', 'Olor', 'Húmedo', 'Roto', 'Otro']
const cacheKey = (pid: string) => `lbags:${pid}`
const doneKey = (cid: string, bid: string) => `ldecl:${cid}:${bid}`
const flag = (k: string) => { try { return localStorage.getItem(k) === '1' } catch { return false } }
const setFlag = (k: string) => { try { localStorage.setItem(k, '1') } catch { /* sin storage */ } }
const unitsOf = (b: PBag) => (b.cycle?.unitsOut?.length ? b.cycle.unitsOut : Array.from({ length: Math.max(1, b.qty) }, (_, i) => i + 1))

// Panel informativo + declaración al cerrar. Sin botones de «abrir» ni «problema»:
// las maletas se cargan en «Carga de turno» y los problemas se reportan en Incidentes.
const BagsPanel = forwardRef<BagsPanelHandle, Props>(function BagsPanel({ cleaningId, propertyId, onToast }, ref) {
  const [data, setData] = useState<Payload | null>(null)
  const [declare, setDeclare] = useState<PBag[] | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    if (!LAUNDRY_ENABLED || !propertyId) return
    try {
      const d = await lGet<Payload>('bagsByProperty', { propertyId, cleaningId })
      setData(d)
      try { localStorage.setItem(cacheKey(propertyId), JSON.stringify(d)) } catch { /* ok */ }
    } catch {
      try { const c = localStorage.getItem(cacheKey(propertyId)); if (c) setData(JSON.parse(c)) } catch { /* ok */ }
    }
  }, [propertyId, cleaningId])
  useEffect(() => { load() }, [load])

  const pending = (d: Payload | null) => (d?.bags || []).filter(b => !b.declaredForThisCleaning && !flag(doneKey(cleaningId, b.id)))

  // El checklist llama esto antes de cerrar la limpieza. No bloquea si no hay maletas o no hay datos (sin señal).
  useImperativeHandle(ref, () => ({
    ensureDeclared: () => new Promise<boolean>(resolve => {
      const todo = pending(data)
      if (!LAUNDRY_ENABLED || todo.length === 0) { resolve(true); return }
      resolver.current = resolve
      setDeclare(todo)
    }),
  }))

  if (!LAUNDRY_ENABLED || !propertyId || !data || data.bags.length === 0) return null

  return (
    <>
      <div className="rounded-3xl overflow-hidden shadow-sm p-5 space-y-2" style={{ background: 'white', border: `1px solid ${L.border}` }}>
        <p className="font-black text-[14px]" style={{ color: L.ink }}>🧺 Maletas de esta casa</p>
        {data.bags.map(b => {
          const declared = b.declaredForThisCleaning || flag(doneKey(cleaningId, b.id))
          const n = Math.max(1, b.qty)
          const inUse = b.cycle?.state === 'In Use'
          const out = b.cycle?.unitsOut || []
          return (
            <div key={b.id} className="rounded-2xl px-3 py-2.5" style={{ background: '#F8FAFC', border: `1px solid ${L.border}` }}>
              <p className="font-bold text-[13px]" style={{ color: L.ink }}>{b.name}{n > 1 ? ` · ${n} maletas` : ''}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {Array.from({ length: n }, (_, i) => i + 1).map(u => {
                  const loaded = inUse && (!out.length || out.includes(u))
                  const st = declared ? 'Devuelta ✓' : loaded ? 'Contigo' : 'No cargada'
                  const bg = declared ? '#DCFCE7' : loaded ? '#E0F2FE' : '#FEF3C7'
                  const fg = declared ? '#15803D' : loaded ? '#0369A1' : '#92400E'
                  return (
                    <span key={u} className="text-[11px] font-bold px-2.5 py-1 rounded-full" style={{ background: bg, color: fg }}>
                      {n > 1 ? `Maleta ${u}` : (b.code || 'Maleta')} · {st}
                    </span>
                  )
                })}
              </div>
              <button onClick={() => setOpen(o => ({ ...o, [b.id]: !o[b.id] }))} className="mt-2 text-[11px] font-bold px-3 py-1.5 rounded-xl" style={{ background: 'white', color: L.teal, border: `1.5px solid ${L.border}` }}>
                {open[b.id] ? '▾ Ocultar contenido' : '👁 Ver qué trae'}
              </button>
              {open[b.id] && (() => {
                const fin = (b.cycle as any)?.finalContent?.counts as Record<string, number> | undefined
                const counts = fin && Object.keys(fin).length ? fin : b.standard
                const rows = Object.entries(counts || {}).filter(([, v]) => v > 0)
                return (
                  <div className="mt-2 rounded-xl px-3 py-2" style={{ background: 'white', border: `1px solid ${L.border}` }}>
                    <p className="text-[10px] font-bold uppercase" style={{ color: L.muted }}>{fin && Object.keys(fin).length ? 'Lo que dejó lavandería' : 'Estándar de la casa'}</p>
                    {rows.length === 0 && <p className="text-[12px]" style={{ color: L.muted }}>Esta maleta no tiene contenido definido.</p>}
                    {rows.map(([k, v]) => <div key={k} className="flex justify-between text-[12px] py-1" style={{ borderTop: '1px solid #F1F5F9' }}><span>{k}</span><b>{v}</b></div>)}
                  </div>
                )
              })()}
            </div>
          )
        })}
        <p className="text-[10px]" style={{ color: L.muted }}>Al terminar la limpieza te preguntaremos qué dejas sucio.</p>
      </div>

      {declare && (
        <DeclareFlow bags={declare} items={data.items} cleaningId={cleaningId}
          onCancel={() => { setDeclare(null); resolver.current?.(false); resolver.current = null }}
          onDone={() => { declare.forEach(b => setFlag(doneKey(cleaningId, b.id))); setDeclare(null); resolver.current?.(true); resolver.current = null; load() }}
          onToast={onToast} />
      )}
    </>
  )
})
export default BagsPanel

interface Detail { units: Record<number, UnitStatus>; short: Record<string, { qty: number; kind: 'left' | 'clean' | 'other' }>; comment: string }
const KIND_LABEL = { left: 'Quedó limpio en la casa', clean: 'Regresa limpio (no se usó)', other: 'Otro' } as const

// ── Una sola pregunta para todas las maletas de la casa ────────────────────────
function DeclareFlow({ bags, items, cleaningId, onCancel, onDone, onToast }: { bags: PBag[]; items: string[]; cleaningId: string; onCancel: () => void; onDone: () => void; onToast: Props['onToast'] }) {
  const [step, setStep] = useState<'ask' | number>('ask') // 'ask' o índice de la maleta en el detalle
  const [details, setDetails] = useState<Record<string, Detail>>({})
  const [bad, setBad] = useState(false)
    const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [blobs, setBlobs] = useState<Blob[]>([])
  const [noPhoto, setNoPhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const needPhoto = bad && blobs.length === 0 && !noPhoto

  const detailOf = (b: PBag): Detail => details[b.id] || { units: Object.fromEntries(unitsOf(b).map(u => [u, 'dirty' as UnitStatus])), short: {}, comment: '' }

  const sendAll = async (list: PBag[]) => {
    setBusy(true)
    try {
      let queued = false
      for (const b of list) {
        const d = detailOf(b)
        const short = Object.entries(d.short).filter(([, v]) => v.qty > 0).map(([item, v]) => ({ item, qty: v.qty, kind: v.kind, reason: d.comment }))
        const units = unitsOf(b).map(u => ({ unit: u, status: d.units[u] || 'dirty' }))
        const r = await submit('declareReturn', {
          cleaningId, bagId: b.id, short, units,
          condition: bad ? 'Malo' : 'Normal', tags: bad ? tags : [], note: [bad ? note : '', d.comment].filter(Boolean).join(' | '),
        }, bad ? blobs : [], `decl_${b.code || b.id}`)
        if (r.status === 'queued') queued = true
      }
      if (queued) onToast('Sin señal: la devolución se enviará sola con sus fotos')
      onDone()
    } catch (e: any) { onToast(e.message, 'err') } finally { setBusy(false) }
  }

  if (step === 'ask') {
    return (
      <Modal title="Maletas de esta casa" onClose={onCancel}>
        <p className="text-[14px] font-semibold" style={{ color: L.ink }}>
          ¿Dejas <b>todo</b> sucio en {bags.length > 1 ? 'las maletas' : `la maleta ${bags[0].code || ''}`}?
        </p>
        <div className="space-y-2">
          <Big color={L.green} disabled={busy || needPhoto} onClick={() => sendAll(bags)}>✅ Sí, todo — terminar</Big>
          <Big ghost color={L.amber} disabled={busy} onClick={() => setStep(0)}>Falta algo / no regresa todo</Big>
        </div>
        <button onClick={() => setBad(b => !b)} className="text-[12px] font-bold" style={{ color: bad ? L.red : L.slate }}>
          {bad ? '▾' : '▸'} Viene en mal estado (manchas, pelos, olor…)
        </button>
        {bad && <BadCondition tags={tags} setTags={setTags} note={note} setNote={setNote} blobs={blobs} setBlobs={setBlobs} noPhoto={noPhoto} setNoPhoto={setNoPhoto} />}
      </Modal>
    )
  }

  const bag = bags[step]
  const d = detailOf(bag)
  const units = unitsOf(bag)
  const itemList = Object.keys(bag.standard).length ? Object.keys(bag.standard) : items
  const setD = (patch: Partial<Detail>) => setDetails(s => ({ ...s, [bag.id]: { ...d, ...patch } }))
  const last = step === bags.length - 1
  const next = () => (last ? sendAll(bags) : setStep(step + 1))

  return (
    <Modal title={`${bag.code || bag.name} (${step + 1}/${bags.length})`} onClose={() => setStep('ask')}
      footer={<Big disabled={busy || (last && needPhoto)} onClick={next}>{last ? 'Confirmar y terminar' : 'Siguiente'}</Big>}>
      {units.length > 1 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase" style={{ color: L.muted }}>¿Qué pasa con cada maleta?</p>
          {units.map(u => (
            <div key={u} className="rounded-2xl p-2.5" style={{ background: 'white', border: `1px solid ${L.border}` }}>
              <p className="text-[12px] font-bold mb-1.5" style={{ color: L.ink }}>Maleta {u}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {([['dirty', 'Regresa sucia', L.green], ['clean', 'Regresa limpia', L.teal], ['stay', 'Se queda en la casa', L.amber]] as const).map(([k, label, color]) => (
                  <button key={k} onClick={() => setD({ units: { ...d.units, [u]: k } })} className="py-2 rounded-xl text-[11px] font-bold leading-tight" style={{ background: (d.units[u] || 'dirty') === k ? color : 'white', color: (d.units[u] || 'dirty') === k ? 'white' : L.slate, border: `1.5px solid ${L.border}` }}>{label}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <p className="text-[11px] font-bold uppercase" style={{ color: L.muted }}>Piezas que NO regresan sucias (si sabes cuáles)</p>
        {itemList.map(it => {
          const cur = d.short[it]
          return (
            <div key={it} className="rounded-2xl p-3" style={{ background: 'white', border: `1px solid ${L.border}` }}>
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-bold" style={{ color: L.ink }}>{it}{bag.standard[it] != null ? ` (std ${bag.standard[it]})` : ''}</p>
                <Counter value={cur?.qty || 0} max={bag.standard[it] ?? 99} onChange={n => setD({ short: { ...d.short, [it]: { qty: n, kind: cur?.kind || 'left' } } })} />
              </div>
              {(cur?.qty || 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map(k => (
                    <button key={k} onClick={() => setD({ short: { ...d.short, [it]: { qty: cur!.qty, kind: k } } })} className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: cur!.kind === k ? L.ink : 'white', color: cur!.kind === k ? 'white' : L.slate, border: `1px solid ${L.border}` }}>{KIND_LABEL[k]}</button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <textarea value={d.comment} onChange={e => setD({ comment: e.target.value })} rows={2} placeholder="Comentario para lavandería (opcional)" className="w-full text-[13px] p-3 rounded-2xl" style={{ border: `1.5px solid ${L.border}` }} />
      {last && (
        <>
          <button onClick={() => setBad(b => !b)} className="text-[12px] font-bold" style={{ color: bad ? L.red : L.slate }}>{bad ? '▾' : '▸'} Viene en mal estado (manchas, pelos, olor…)</button>
          {bad && <BadCondition tags={tags} setTags={setTags} note={note} setNote={setNote} blobs={blobs} setBlobs={setBlobs} noPhoto={noPhoto} setNoPhoto={setNoPhoto} />}
        </>
      )}
    </Modal>
  )
}

function BadCondition(p: {
  tags: string[]; setTags: (t: string[]) => void
  note: string; setNote: (n: string) => void; blobs: Blob[]; setBlobs: (b: Blob[]) => void; noPhoto: boolean; setNoPhoto: (v: boolean) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[12px] font-bold" style={{ color: L.red }}>Se marcará como condición «Malo» (tratamiento especial en lavandería).</p>
      <div className="flex flex-wrap gap-2">
        {TAGS.map(t => <button key={t} onClick={() => p.setTags(p.tags.includes(t) ? p.tags.filter(y => y !== t) : [...p.tags, t])} className="px-3 py-1.5 rounded-full text-[12px] font-bold" style={{ background: p.tags.includes(t) ? L.ink : 'white', color: p.tags.includes(t) ? 'white' : L.slate, border: `1px solid ${L.border}` }}>{t}</button>)}
      </div>
      <textarea value={p.note} onChange={e => p.setNote(e.target.value)} rows={2} placeholder="Nota para lavandería" className="w-full text-[13px] p-3 rounded-2xl" style={{ border: `1.5px solid ${L.border}` }} />
      <p className="text-[11px] font-bold uppercase" style={{ color: L.muted }}>Foto (obligatoria)</p>
      <BlobPhotos blobs={p.blobs} onChange={p.setBlobs} />
      {p.blobs.length === 0 && <label className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: L.slate }}><input type="checkbox" checked={p.noPhoto} onChange={e => p.setNoPhoto(e.target.checked)} /> No puedo tomar foto ahora</label>}
    </div>
  )
}
