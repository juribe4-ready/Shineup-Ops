import { memo, useMemo } from 'react'
import { Clock, Package, Home } from 'lucide-react'

// Fila de la agenda (reemplaza visualmente a CleaningCard en la pantalla principal).
const TEAL = '#0E7C86'

export const STATUS_STYLE: Record<string, { bg: string; fg: string; dot: string }> = {
  Programmed:    { bg: '#FFF4E5', fg: '#B45309', dot: '#F59E0B' },
  Opened:        { bg: '#FEF9C3', fg: '#854D0E', dot: '#EAB308' },
  'In Progress': { bg: '#E5EEFF', fg: '#1D4ED8', dot: '#3B82F6' },
  Done:          { bg: '#E8F8EF', fg: '#15803D', dot: '#22C55E' },
}
export const normStatus = (s?: string) => (s === 'Scheduled' || !s ? 'Programmed' : s)

// Colores por tipo de limpieza. Los tipos conocidos tienen color fijo; los demás se asignan por nombre (siempre el mismo).
const TYPE_FIXED: Record<string, [string, string, string]> = {
  'standard str turnover': ['#10B981', '#ECFDF5', '#047857'],
  'residential cleaning':  ['#3B82F6', '#EFF6FF', '#1D4ED8'],
  'deep clean':            ['#F59E0B', '#FEF3C7', '#92400E'],
  'move out/in':           ['#EC4899', '#FCE7F3', '#BE185D'],
}
const TYPE_POOL: [string, string, string][] = [
  ['#8B5CF6', '#F5F3FF', '#6D28D9'], ['#14B8A6', '#F0FDFA', '#0F766E'], ['#EF4444', '#FEF2F2', '#B91C1C'],
  ['#0EA5E9', '#F0F9FF', '#0369A1'], ['#84CC16', '#F7FEE7', '#4D7C0F'], ['#F97316', '#FFF7ED', '#C2410C'],
]
export function typeColors(type?: string): [string, string, string] {
  if (!type) return ['#CBD5E1', '#F1F5F9', '#475569']
  const k = type.trim().toLowerCase()
  if (TYPE_FIXED[k]) return TYPE_FIXED[k]
  let h = 0
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0
  return TYPE_POOL[h % TYPE_POOL.length]
}

function formatTime(v?: string): string | null {
  if (!v) return null
  const d = new Date(v)
  if (isNaN(d.getTime()) || d.getFullYear() <= 2020) return null
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
}

interface Props {
  cleaning: {
    id: string; status?: string; propertyText?: string; address?: string; scheduledTime?: string
    staffList?: string[]; equipmentCount?: number; attachments?: Array<{ url: string }>; cleaningType?: string
  }
  onClick: () => void
}

const CleaningRow = memo<Props>(({ cleaning, onClick }) => {
  const st = normStatus(cleaning.status)
  const sty = STATUS_STYLE[st] || STATUS_STYLE.Programmed
  const done = st === 'Done'
  const [bar, tbg, tfg] = typeColors(cleaning.cleaningType)
  const img = useMemo(() => cleaning.attachments?.[0]?.url, [cleaning.attachments])
  const time = useMemo(() => formatTime(cleaning.scheduledTime), [cleaning.scheduledTime])
  const staff = cleaning.staffList || []
  const eq = cleaning.equipmentCount ?? 0
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex gap-3 items-center rounded-2xl bg-white p-3 active:scale-[0.99] transition-all"
      style={{ border: '1px solid #E2E8F0', borderLeft: `4px solid ${bar}`, opacity: done ? 0.6 : 1 }}
    >
      <div className="shrink-0 rounded-xl overflow-hidden flex items-center justify-center" style={{ width: 56, height: 56, background: '#F1F5F9' }}>
        {img
          ? <img src={img} alt="" loading="lazy" decoding="async" width={56} height={56} className="w-full h-full object-cover" style={done ? { filter: 'grayscale(.4)' } : undefined} />
          : <Home className="w-5 h-5" style={{ color: '#CBD5E1' }} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="flex-1 min-w-0 truncate font-bold text-[14.5px]" style={{ color: '#0F172A' }}>{cleaning.propertyText || 'Propiedad'}</p>
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: sty.bg, color: sty.fg }}>{st}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11.5px]" style={{ color: '#64748B' }}>
          <Clock className="w-3 h-3 shrink-0" />
          <span className="shrink-0">{time || '--:--'}</span>
          {cleaning.cleaningType && (
            <span className="truncate text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: tbg, color: tfg }}>{cleaning.cleaningType}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="flex items-center">
            {staff.length > 0
              ? staff.slice(0, 4).map((ini, i) => (
                  <span key={i} className="w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black text-white" style={{ background: '#9C7FE8', marginLeft: i ? -4 : 0 }}>{ini}</span>
                ))
              : <span className="text-[10px]" style={{ color: '#CBD5E1' }}>Sin staff</span>}
          </div>
          {eq > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md" style={{ background: '#F1F5F9', color: '#475569' }}>
              <Package className="w-3 h-3" />{eq}
            </span>
          )}
        </div>
      </div>
    </button>
  )
})
CleaningRow.displayName = 'CleaningRow'
export default CleaningRow
export { TEAL }
