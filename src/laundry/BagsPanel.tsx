import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { lGet, lPost, LAUNDRY_ENABLED } from './api'
import { submit } from './outbox'
import { Big, BlobPhotos, Counter, L, Modal } from './ui'

type UnitStatus = 'dirty' | 'clean' | 'stay'
interface PBag {
  id: string; code: string | null; name: string; qty: number; state: string | null; standard: Record<string, number>
  cycle: { id: string; state: string | null; unitsOut: number[]; bagsOut: number | null; finalContent?: { counts?: Record<string, number> } | null } | null; declaredForThisCleaning: boolean
}
interface Payload { bags: PBag[]; items: string[] }
export interface BagsPanelHandle { ensureDeclared: () => Promise<boolean> }
interface Props { cleaningId: string; propertyId?: string; isInProgress: boolean; onToast: (msg: string, type?: 'ok' | 'err') => void }

const TAGS = ['Manchas', 'Pelos', 'Olor', 'Húmedo', 'Roto', 'Otro']
const cacheKey = (pid: string) => `lbags:${pid}`
const doneKey = (cid: string, bid: string) => `ldecl:${cid}:${bid}`
const refrKey = (cid: string, bid: string) => `lrefr:${cid}:${bid}`
// Lo que «dice» la maleta: el contenido final que dejó lavandería; si no hay, el estándar de la casa
const expectedOf = (b: PBag): Record<string, number> => { const fc = b.cycle?.finalContent?.counts; return fc && Object.keys(fc).length ? fc : b.standard }
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
  const [refr, setRefr] = useState<PBag | null>(null)
  const [, tick] = useState(0)

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
              {inUse && !declared && (flag(refrKey(cleaningId, b.id))
                ? <span className="ml-2 text-[11px] font-bold px-3 py-1.5 rounded-xl inline-block" style={{ background: '#DCFCE7', color: '#15803D' }}>✔ Refrendada</span>
                : <button onClick={() => setRefr(b)} className="ml-2 mt-2 text-[11px] font-bold px-3 py-1.5 rounded-xl" style={{ background: L.teal, color: 'white' }}>✔ Revisar y refrendar</button>)}
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
        <p className="text-[10px]" style={{ color: L.muted }}>Durante la limpieza revisa la maleta y refréndala. Al terminar te preguntaremos qué regresa sucio y dónde la dejas.</p>
      </div>

      {refr && (
        <RefrendoSheet bag={refr} cleaningId={cleaningId} onClose={() => setRefr(null)} onToast={onToast}
          onDone={() => { setFlag(refrKey(cleaningId, refr.id)); setRefr(null); tick(n => n + 1); load() }} />
      )}

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

type Place = 'transporte' | 'casa' | 'bodega' | 'lavanderia'
interface Detail { dirty: Record<string, number>; kind: Record<string, 'left' | 'clean' | 'other'>; place: Record<number, Place>; comment: string }
const KIND_LABEL = { clean: 'No se usó', left: 'Se quedó en la casa', other: 'Se perdió / otro' } as const
const PLACES: [Place, string][] = [['transporte', 'Me la llevo'], ['casa', 'Queda en la casa'], ['bodega', 'La dejo en bodega'], ['lavanderia', 'Entregada en lavandería']]
const listOf = (b: PBag, all: string[]) => { const e = expectedOf(b); const ks = Object.keys(e).filter(k => e[k] > 0); return ks.length ? ks : all }

// ── Refrendo 1 (durante la limpieza): el cleaner abre la maleta y cuenta contra lo que dice lavandería ──
function RefrendoSheet({ bag, cleaningId, onClose, onDone, onToast }: { bag: PBag; cleaningId: string; onClose: () => void; onDone: () => void; onToast: Props['onToast'] }) {
  const exp = expectedOf(bag)
  const items = listOf(bag, [])
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(items.map(k => [k, exp[k] || 0])))
  const [dirtyOn, setDirtyOn] = useState(false)
  const [dirty, setDirty] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [blobs, setBlobs] = useState<Blob[]>([])
  const [busy, setBusy] = useState(false)
  const diffs = items.filter(k => (counts[k] ?? 0) !== (exp[k] || 0))
  const dirtyList = dirtyOn ? items.filter(k => (dirty[k] || 0) > 0) : []
  const issues = diffs.length + dirtyList.length
  const go = async () => {
    setBusy(true)
    try {
      const r = await submit<{ incidentsCreated: number }>('refrendo', { cleaningId, bagId: bag.id, counts, dirty: dirtyOn ? dirty : {}, note }, issues ? blobs : [], `refr_${bag.code || bag.id}`)
      onToast(r.status === 'queued' ? 'Sin señal: el refrendo se enviará solo' : (r.data.incidentsCreated ? `Refrendo enviado · ${r.data.incidentsCreated} incidente(s) registrados` : 'Refrendo ✓ todo coincide'))
      onDone()
    } catch (e: any) { onToast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title={`Revisar · ${bag.code || bag.name}`} onClose={onClose}
      footer={<Big disabled={busy} onClick={go}>{busy ? 'Enviando…' : issues ? `Confirmar refrendo (${issues} diferencia${issues > 1 ? 's' : ''})` : '✔ Confirmar: todo coincide'}</Big>}>
      <p className="text-[12px]" style={{ color: L.slate }}>Abre la maleta y cuenta. Viene lo que <b>dice lavandería</b>; cambia solo lo que no coincida.</p>
      <div className="rounded-2xl px-3" style={{ background: 'white', border: `1px solid ${L.border}` }}>
        {items.map(k => {
          const diff = (counts[k] ?? 0) - (exp[k] || 0)
          return (
            <div key={k} className="flex items-center justify-between py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
              <div><p className="text-[13px] font-bold" style={{ color: L.ink }}>{k}</p><p className="text-[10px]" style={{ color: diff ? L.red : L.muted }}>Dice lavandería: {exp[k] || 0}{diff < 0 ? ` · falta ${-diff}` : diff > 0 ? ` · sobra ${diff}` : ''}</p></div>
              <Counter value={counts[k] ?? 0} onChange={n => setCounts(c => ({ ...c, [k]: n }))} />
            </div>
          )
        })}
      </div>
      {diffs.length > 0 && <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}>⚠ {diffs.length} diferencia(s): se registrarán como incidente («Faltante» o «Sobrante», en propiedad) ligado a esta limpieza y a la maleta.</div>}
      <div className="rounded-2xl p-3" style={{ background: 'white', border: `1px solid ${L.border}` }}>
        <p className="text-[13px] font-bold mb-2" style={{ color: L.ink }}>¿Hay algo sucio o manchado?</p>
        <div className="grid grid-cols-2 gap-2">
          {([[false, 'No, todo limpio'], [true, 'Sí, marcar piezas']] as const).map(([v, t]) => (
            <button key={t} onClick={() => setDirtyOn(v)} className="py-2.5 rounded-xl text-[12px] font-bold" style={{ background: dirtyOn === v ? L.teal : 'white', color: dirtyOn === v ? 'white' : L.slate, border: `1.5px solid ${L.border}` }}>{t}</button>
          ))}
        </div>
        {dirtyOn && (
          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase mb-1" style={{ color: L.muted }}>Cuántas de cada pieza vinieron sucias</p>
            {items.map(k => (
              <div key={k} className="flex items-center justify-between py-1.5" style={{ borderTop: '1px solid #F1F5F9' }}>
                <span className="text-[12px]" style={{ color: L.ink }}>{k}</span>
                <Counter value={dirty[k] || 0} max={counts[k] ?? 99} onChange={n => setDirty(d => ({ ...d, [k]: n }))} />
              </div>
            ))}
          </div>
        )}
      </div>
      {issues > 0 && (
        <>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Comentario (opcional)" className="w-full text-[13px] p-3 rounded-2xl" style={{ border: `1.5px solid ${L.border}` }} />
          <p className="text-[11px] font-bold uppercase" style={{ color: L.muted }}>Foto (recomendada)</p>
          <BlobPhotos blobs={blobs} onChange={setBlobs} />
        </>
      )}
    </Modal>
  )
}

// ── Refrendo 2 (al terminar): qué regresa sucio y dónde la deja ─────────────────
function DeclareFlow({ bags, items, cleaningId, onCancel, onDone, onToast }: { bags: PBag[]; items: string[]; cleaningId: string; onCancel: () => void; onDone: () => void; onToast: Props['onToast'] }) {
  const [step, setStep] = useState(0)
  const [details, setDetails] = useState<Record<string, Detail>>({})
  const [bad, setBad] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [blobs, setBlobs] = useState<Blob[]>([])
  const [noPhoto, setNoPhoto] = useState(false)
  const [busy, setBusy] = useState(false)
  const needPhoto = bad && blobs.length === 0 && !noPhoto

  const detailOf = (b: PBag): Detail => details[b.id] || {
    dirty: Object.fromEntries(listOf(b, items).map(k => [k, expectedOf(b)[k] ?? b.standard[k] ?? 0])),
    kind: {}, place: Object.fromEntries(unitsOf(b).map(u => [u, 'transporte' as Place])), comment: '',
  }

  const sendAll = async () => {
    setBusy(true)
    try {
      let queued = false
      for (const b of bags) {
        const d = detailOf(b), exp = expectedOf(b)
        const short = listOf(b, items).filter(k => (d.dirty[k] ?? 0) < (exp[k] ?? 0)).map(k => ({ item: k, qty: (exp[k] ?? 0) - (d.dirty[k] ?? 0), kind: d.kind[k] || 'clean', reason: d.comment }))
        const units = unitsOf(b).map(u => { const pl = d.place[u] || 'transporte'; return { unit: u, status: pl === 'casa' ? 'stay' : 'dirty', ...(pl === 'bodega' || pl === 'lavanderia' ? { place: pl } : {}) } })
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

  const bag = bags[step]
  const d = detailOf(bag)
  const exp = expectedOf(bag)
  const units = unitsOf(bag)
  const itemList = listOf(bag, items)
  const setD = (patch: Partial<Detail>) => setDetails(s => ({ ...s, [bag.id]: { ...d, ...patch } }))
  const last = step === bags.length - 1
  const allDefault = itemList.every(k => (d.dirty[k] ?? 0) === (exp[k] ?? 0)) && units.every(u => (d.place[u] || 'transporte') === 'transporte')
  const next = () => (last ? sendAll() : setStep(step + 1))

  return (
    <Modal title={`${bag.code || bag.name}${bags.length > 1 ? ` (${step + 1}/${bags.length})` : ''}`} onClose={step > 0 ? () => setStep(step - 1) : onCancel}
      footer={<Big color={allDefault ? L.green : L.teal} disabled={busy || (last && needPhoto)} onClick={next}>{busy ? 'Enviando…' : last ? (allDefault ? '✅ Todo sucio — enviar a lavandería' : 'Confirmar y terminar') : 'Siguiente'}</Big>}>
      <p className="text-[12px] font-semibold" style={{ color: L.slate }}>Esto es lo que <b>mandas a lavandería</b>. Viene todo sucio por defecto; cambia solo lo que no.</p>
      <div className="rounded-2xl px-3" style={{ background: 'white', border: `1px solid ${L.border}` }}>
        {itemList.map(k => {
          const cur = d.dirty[k] ?? 0, e = exp[k] ?? 0, short = cur < e
          return (
            <div key={k} className="py-2" style={{ borderTop: '1px solid #F1F5F9' }}>
              <div className="flex items-center justify-between">
                <div><p className="text-[13px] font-bold" style={{ color: L.ink }}>{k}</p><p className="text-[10px]" style={{ color: short ? L.amber : L.muted }}>Trae {e}{short ? ` · ${e - cur} no regresa sucia` : ' · todas regresan sucias'}</p></div>
                <Counter value={cur} max={e} onChange={n => setD({ dirty: { ...d.dirty, [k]: n } })} />
              </div>
              {short && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map(kd => (
                    <button key={kd} onClick={() => setD({ kind: { ...d.kind, [k]: kd } })} className="px-2.5 py-1 rounded-full text-[11px] font-bold" style={{ background: (d.kind[k] || 'clean') === kd ? L.ink : 'white', color: (d.kind[k] || 'clean') === kd ? 'white' : L.slate, border: `1px solid ${L.border}` }}>{KIND_LABEL[kd]}</button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] font-bold uppercase" style={{ color: L.muted }}>¿Dónde {units.length > 1 ? 'deja cada maleta' : 'la dejas'}?</p>
      {units.map(u => (
        <div key={u} className="rounded-2xl p-2.5" style={{ background: 'white', border: `1px solid ${L.border}` }}>
          {units.length > 1 && <p className="text-[12px] font-bold mb-1.5" style={{ color: L.ink }}>Maleta {u}</p>}
          <div className="grid grid-cols-2 gap-1.5">
            {PLACES.map(([k, label]) => (
              <button key={k} onClick={() => setD({ place: { ...d.place, [u]: k } })} className="py-2 rounded-xl text-[11px] font-bold leading-tight" style={{ background: (d.place[u] || 'transporte') === k ? L.teal : 'white', color: (d.place[u] || 'transporte') === k ? 'white' : L.slate, border: `1.5px solid ${L.border}` }}>{label}</button>
            ))}
          </div>
        </div>
      ))}
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
