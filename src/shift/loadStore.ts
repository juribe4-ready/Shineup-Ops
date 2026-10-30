// Lista de kits y herramientas asignadas hoy + cuáles ya se cargaron al transporte.
// Se guarda solo en el teléfono (por día): no existe todavía un campo en Airtable para esto.
export interface Equip { code: string; text: string; cids?: string[] }
let equipment: Equip[] = []
const listeners = new Set<() => void>()
const day = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const key = () => `shineup-load-${day()}`
const notify = () => listeners.forEach(l => l())

export const subscribeLoad = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const setEquipment = (list: Equip[]) => { equipment = list; notify() }
export const getEquipment = () => equipment
export const findEquipment = (code: string) => equipment.find(e => e.code.trim().toUpperCase() === code.trim().toUpperCase())

export function getChecked(): Set<string> {
  try { return new Set<string>(JSON.parse(localStorage.getItem(key()) || '[]')) } catch { return new Set() }
}
export function setChecked(code: string, on: boolean) {
  const s = getChecked()
  const c = code.trim().toUpperCase()
  on ? s.add(c) : s.delete(c)
  try { localStorage.setItem(key(), JSON.stringify([...s])) } catch { /* sin almacenamiento: queda solo en pantalla */ }
  notify()
}

// ── Maletas físicas asignadas hoy (una por unidad: una casa puede tener 2) ──
export interface BagUnit { code: string; bagId: string; propertyId: string; house: string; n: number; of: number; loaded: boolean; state: string | null; opened: boolean }
let units: BagUnit[] = []
export const setUnits = (u: BagUnit[]) => { units = u; notify() }
export const getUnits = () => units
export const markUnitLoaded = (code: string) => { units = units.map(u => u.code.toUpperCase() === code.toUpperCase() ? { ...u, loaded: true } : u); notify() }

// Códigos de cada maleta de un conjunto: M-CH-LI-1 con 2 maletas → M-CH-LI-1, M-CH-LI-2
export function unitCodesOf(bag: { code?: string | null; qty?: number }): string[] {
  const n = Math.max(1, bag.qty || 1)
  const code = String(bag.code || '').toUpperCase()
  if (!code) return []
  const m = code.match(/^(M-[A-Z0-9]{2}-[A-Z0-9]{2})-(\d{1,2})$/)
  return Array.from({ length: n }, (_, i) => m ? `${m[1]}-${Number(m[2]) + i}` : `${code}-${i + 1}`)
}
// ¿esa maleta (n = 1..qty) ya salió con el cleaner?
export const unitIsLoaded = (cycle: any, n: number) => cycle?.state === 'In Use' && (!(cycle.unitsOut || []).length || cycle.unitsOut.includes(n))

// Resumen de carga de UNA casa/limpieza para la agenda (solo si ya se abrió la lista de carga del turno)
export function loadSummary(cleaningId: string, propertyId?: string | null) {
  const us = propertyId ? units.filter(u => u.propertyId === propertyId) : []
  const eq = equipment.filter(e => (e.cids || []).includes(cleaningId))
  const ck = getChecked()
  return { bags: us.length, bagsLoaded: us.filter(u => u.loaded).length, kits: eq.length, kitsLoaded: eq.filter(e => ck.has(e.code.trim().toUpperCase())).length }
}
