// Lista de kits y herramientas asignadas hoy + cuáles ya se cargaron al transporte.
// Se guarda solo en el teléfono (por día): no existe todavía un campo en Airtable para esto.
export interface Equip { code: string; text: string }
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
