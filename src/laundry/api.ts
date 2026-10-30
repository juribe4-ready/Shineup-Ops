import { supabase } from '../AuthContext'

// La app Laundry vive aparte (otro proyecto de Vercel). Ops solo la llama.
// Si VITE_LAUNDRY_API_URL no está definida, todo el módulo queda apagado y Ops funciona como antes.
const BASE = ((import.meta as any).env?.VITE_LAUNDRY_API_URL || '').replace(/\/$/, '')
export const LAUNDRY_ENABLED = !!BASE

export class ApiError extends Error { status: number; constructor(m: string, status: number) { super(m); this.status = status } }

async function req<T>(method: 'GET' | 'POST', type: string, params?: Record<string, string>, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const qs = new URLSearchParams({ type, ...(params || {}) }).toString()
  const r = await fetch(`${BASE}/api/laundry?${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await r.json().catch(() => ({}))
  if (!r.ok) throw new ApiError(json?.error || `Error ${r.status}`, r.status)
  return json as T
}
export const lGet = <T,>(type: string, params?: Record<string, string>) => req<T>('GET', type, params)
export const lPost = <T,>(type: string, body: unknown) => req<T>('POST', type, undefined, body)
