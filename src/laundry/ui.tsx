import { useRef, useState, ReactNode } from 'react'
import { Camera, X } from 'lucide-react'
import { compressImage } from './photos'

export const L = { teal: '#00BCD4', ink: '#0F172A', slate: '#475569', muted: '#94A3B8', border: '#E2E8F0', red: '#EF4444', amber: '#F59E0B', green: '#10B981', violet: '#8B5CF6' }

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" style={{ background: 'rgba(15,23,42,0.55)' }}>
      <div className="rounded-t-[28px] flex flex-col" style={{ background: '#F8FAFC', maxHeight: '92vh', fontFamily: 'Poppins, sans-serif' }}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="font-black text-[16px]" style={{ color: L.ink }}>{title}</p>
          <button onClick={onClose} style={{ color: L.slate }}><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 pb-3 overflow-y-auto space-y-3">{children}</div>
        {footer && <div className="px-5 pb-6 pt-2 space-y-2">{footer}</div>}
      </div>
    </div>
  )
}

export function Big({ children, onClick, color = L.teal, disabled, ghost }: { children: ReactNode; onClick: () => void; color?: string; disabled?: boolean; ghost?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="w-full py-3.5 rounded-2xl font-black text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-all"
      style={{ background: ghost ? 'white' : color, color: ghost ? color : 'white', border: ghost ? `1.5px solid ${color}` : 'none', opacity: disabled ? 0.45 : 1 }}>{children}</button>
  )
}

export function Counter({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="w-9 h-9 rounded-full font-black text-[18px]" style={{ background: 'white', border: `1.5px solid ${L.border}`, color: L.slate }}>−</button>
      <span className="w-6 text-center font-black text-[16px]" style={{ color: L.ink }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="w-9 h-9 rounded-full font-black text-[18px]" style={{ background: 'white', border: `1.5px solid ${L.border}`, color: L.slate }}>+</button>
    </div>
  )
}

// Fotos que se quedan en el teléfono (blobs) hasta que se envía: así funcionan sin señal.
export function BlobPhotos({ blobs, onChange }: { blobs: Blob[]; onChange: (b: Blob[]) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [urls, setUrls] = useState<string[]>([])
  const add = async (files: FileList | null) => {
    if (!files) return
    const next = [...blobs]; const nu = [...urls]
    for (const f of Array.from(files)) { const b = await compressImage(f); next.push(b); nu.push(URL.createObjectURL(b)) }
    onChange(next); setUrls(nu)
    if (ref.current) ref.current.value = ''
  }
  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <div key={u} className="relative">
          <img src={u} alt="" className="w-16 h-16 rounded-xl object-cover" />
          <button onClick={() => { onChange(blobs.filter((_, j) => j !== i)); setUrls(urls.filter((_, j) => j !== i)) }} className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full text-white text-[11px]" style={{ background: L.red }}>×</button>
        </div>
      ))}
      <button onClick={() => ref.current?.click()} className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ border: `2px dashed ${L.muted}`, color: L.slate }}><Camera className="w-5 h-5" /></button>
      <input ref={ref} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => add(e.target.files)} />
    </div>
  )
}
