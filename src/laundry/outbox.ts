import { ApiError, lPost } from './api'
import { uploadBlob } from './photos'

// Cola de envíos pendientes (IndexedDB). Si no hay señal, la acción y sus fotos se guardan
// en el teléfono y se reenvían solas al volver la conexión. El servidor es idempotente
// (declareReturn / markInUse detectan duplicados), así que reintentar es seguro.
interface Entry { id: string; type: string; body: Record<string, any>; blobs: Blob[]; tag: string; at: number; lastError?: string }

const DB = 'shineup-laundry-outbox'
const STORE = 'q'
const listeners = new Set<() => void>()
let flushing = false

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' })
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error)
  })
}
const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await open()
  return new Promise((res, rej) => { const r = fn(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
}
const all = () => tx<Entry[]>('readonly', s => s.getAll())
const put = (e: Entry) => tx('readwrite', s => s.put(e))
const del = (id: string) => tx('readwrite', s => s.delete(id))
const notify = () => listeners.forEach(l => l())

export const subscribeOutbox = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const pendingCount = async () => { try { return (await all()).length } catch { return 0 } }
export const pendingEntries = async () => { try { return await all() } catch { return [] as Entry[] } }

const isNetwork = (e: unknown) => !(e instanceof ApiError) // sin respuesta del servidor = sin señal

async function run(e: Entry) {
  const urls: string[] = []
  for (const b of e.blobs) urls.push(await uploadBlob(b, e.tag))
  const body = { ...e.body, photos: [...(e.body.photos || []), ...urls] }
  return lPost(e.type, body)
}

// Envía ya; si falla por red, lo deja en la cola. Devuelve 'sent' | 'queued'. Errores del servidor (4xx/5xx) sí se lanzan.
export async function submit<T = any>(type: string, body: Record<string, any>, blobs: Blob[] = [], tag = 'ops'): Promise<{ status: 'sent'; data: T } | { status: 'queued' }> {
  const entry: Entry = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, body, blobs, tag, at: Date.now() }
  try {
    const data = (await run(entry)) as T
    return { status: 'sent', data }
  } catch (err) {
    if (!isNetwork(err)) throw err
    try { await put({ ...entry, lastError: (err as Error).message }) } catch { throw new Error('Sin señal y no se pudo guardar en el teléfono') }
    notify()
    return { status: 'queued' }
  }
}

export async function flush(): Promise<number> {
  if (flushing) return 0
  flushing = true
  let sent = 0
  try {
    const list = (await all()).sort((a, b) => a.at - b.at)
    for (const e of list) {
      try { await run(e); await del(e.id); sent++ }
      catch (err) {
        if (isNetwork(err)) break // sigue sin señal: parar
        const st = (err as ApiError).status
        await put({ ...e, lastError: (err as Error).message })
        // 401/403/5xx: se conserva y se reintenta luego (sesión vencida o servidor caído).
        // 400/404/409/422: el servidor lo rechaza para siempre; se descarta (queda el aviso en la pantalla).
        if (st === 401 || st === 403 || st >= 500) break
        await del(e.id)
      }
    }
  } finally { flushing = false; notify() }
  return sent
}

export function startOutbox() {
  const go = () => { flush().catch(() => {}) }
  window.addEventListener('online', go)
  const t = window.setInterval(go, 45000)
  go()
  return () => { window.removeEventListener('online', go); window.clearInterval(t) }
}
