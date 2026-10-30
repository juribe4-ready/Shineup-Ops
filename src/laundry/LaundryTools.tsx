import { useEffect, useState } from 'react'
import { ScanLine, PackagePlus, CloudOff } from 'lucide-react'
import { LAUNDRY_ENABLED, lGet } from './api'
import { flush, pendingCount, subscribeOutbox, submit } from './outbox'
import Scanner from './Scanner'
import { Big, L, Modal } from './ui'

// Botones globales en la pantalla de inicio de Ops: escanear una maleta y cargar el turno.
export default function LaundryTools({ onToast }: { onToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [mode, setMode] = useState<null | 'scan' | 'shift'>(null)
  const [pending, setPending] = useState(0)
  useEffect(() => {
    if (!LAUNDRY_ENABLED) return
    const refresh = () => pendingCount().then(setPending)
    refresh()
    const un = subscribeOutbox(refresh)
    return () => { un() }
  }, [])
  if (!LAUNDRY_ENABLED) return null
  return (
    <>
      <div className="flex gap-2 mb-3">
        <button onClick={() => setMode('scan')} className="flex-1 py-2.5 rounded-2xl text-[12px] font-bold flex items-center justify-center gap-1.5 bg-white shadow-sm" style={{ color: '#0097A7' }}><ScanLine className="w-4 h-4" /> Escanear maleta</button>
        <button onClick={() => setMode('shift')} className="flex-1 py-2.5 rounded-2xl text-[12px] font-bold flex items-center justify-center gap-1.5 bg-white shadow-sm" style={{ color: '#0097A7' }}><PackagePlus className="w-4 h-4" /> Carga de turno</button>
      </div>
      {pending > 0 && (
        <button onClick={() => flush().then(n => onToast(n ? `${n} envío(s) sincronizado(s)` : 'Sigue sin señal'))} className="w-full mb-3 py-2 rounded-xl text-[12px] font-bold flex items-center justify-center gap-1.5" style={{ background: '#FEF3C7', color: '#92400E' }}>
          <CloudOff className="w-4 h-4" /> {pending} pendiente(s) por enviar · toca para reintentar
        </button>
      )}
      {mode === 'scan' && <ScanOne onClose={() => setMode(null)} />}
      {mode === 'shift' && <ShiftLoad onClose={() => setMode(null)} onToast={onToast} />}
    </>
  )
}

function ScanOne({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<any>(null)
  const [err, setErr] = useState('')
  const onCode = async (code: string) => {
    setErr('')
    try { setInfo(await lGet('bag', { code })) } catch (e: any) { setErr(e.message) }
  }
  return (
    <Modal title="Escanear maleta" onClose={onClose}>
      <Scanner onCode={onCode} paused={!!info} />
      {err && <p className="text-[12px] font-semibold" style={{ color: L.red }}>{err}</p>}
      {info && (
        <div className="rounded-2xl p-4" style={{ background: 'white', border: `1px solid ${L.border}` }}>
          <p className="font-black text-[15px]" style={{ color: L.ink }}>{info.bag.code} · {info.bag.name}</p>
          <p className="text-[13px] mt-1" style={{ color: L.slate }}>Estado: <b>{info.cycle?.state || info.bag.state || 'sin estado'}</b> · Semáforo: <b>{info.semaforo}</b></p>
          <p className="text-[12px] mt-1" style={{ color: L.muted }}>{info.bag.properties.map((p: any) => p.name).join(' · ')}</p>
          <div className="mt-3"><Big ghost color={L.teal} onClick={() => setInfo(null)}>Escanear otra</Big></div>
        </div>
      )}
    </Modal>
  )
}

function ShiftLoad({ onClose, onToast }: { onClose: () => void; onToast: (m: string, t?: 'ok' | 'err') => void }) {
  const [codes, setCodes] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const add = (c: string) => setCodes(l => l.includes(c.toUpperCase()) ? l : [...l, c.toUpperCase()])
  const send = async () => {
    setBusy(true)
    try {
      const r = await submit<{ loaded: { code: string; warning: string | null }[]; unknown: string[] }>('loadShift', { codes })
      if (r.status === 'queued') onToast('Sin señal: la carga se enviará sola')
      else {
        const warns = r.data.loaded.filter(l => l.warning).map(l => `${l.code}: ${l.warning}`)
        onToast(warns.length ? `⚠ ${warns.join(' | ')}` : `${r.data.loaded.length} maleta(s) cargadas ✓`, warns.length || r.data.unknown.length ? 'err' : 'ok')
      }
      onClose()
    } catch (e: any) { onToast(e.message, 'err') } finally { setBusy(false) }
  }
  return (
    <Modal title="Carga de turno" onClose={onClose} footer={<Big onClick={send} disabled={busy || codes.length === 0}>Confirmar carga ({codes.length})</Big>}>
      <p className="text-[12px]" style={{ color: L.slate }}>Escanea cada maleta que subes a la van (una por una: C-014-1, C-014-2…). Quedan «In Use» contigo. Insumos y herramientas se sumarán después.</p>
      <Scanner onCode={add} />
      <div className="flex flex-wrap gap-2">
        {codes.map(c => <button key={c} onClick={() => setCodes(l => l.filter(x => x !== c))} className="px-3 py-1.5 rounded-full text-[12px] font-bold" style={{ background: L.ink, color: 'white' }}>{c} ×</button>)}
      </div>
    </Modal>
  )
}
