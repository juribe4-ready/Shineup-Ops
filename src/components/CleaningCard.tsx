import { memo, useMemo } from 'react'
import { Clock, Calendar, Package, CheckCircle2 } from 'lucide-react'

const TEAL = '#00BCD4'
const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']

function formatDate(dateString?: string): string {
  if (!dateString) return '--/--'
  const [, month, day] = (dateString.split('T')[0]).split('-')
  return `${parseInt(day)} ${MONTHS[parseInt(month) - 1]}`
}

function formatTime(timeValue?: string): string | null {
  if (!timeValue) return null
  try {
    const d = new Date(timeValue)
    if (!isNaN(d.getTime()) && d.getFullYear() > 2020) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
    }
  } catch { return null }
  return null
}

function statusColor(status?: string): string {
  switch (status) {
    case 'In Progress': return 'bg-blue-500 text-white'
    case 'Scheduled':
    case 'Programmed':  return 'bg-amber-400 text-white'
    case 'Done':        return 'bg-emerald-500 text-white'
    default:            return 'bg-slate-400 text-white'
  }
}

interface Cleaning {
  id: string
  status?: string
  attachments?: Array<{ url: string }>
  propertyText?: string
  address?: string
  scheduledTime?: string
  date?: string
  staffList?: string[]
  equipmentCount?: number
}

interface Props {
  cleaning: Cleaning
  onClick: () => void
}

const CleaningCard = memo<Props>(({ cleaning, onClick }) => {
  const isDone = cleaning.status === 'Done'
  const imageUrl = useMemo(() => cleaning.attachments?.[0]?.url, [cleaning.attachments])
  const statusClass = useMemo(() => statusColor(cleaning.status), [cleaning.status])
  const formattedDate = useMemo(() => formatDate(cleaning.date), [cleaning.date])
  const formattedTime = useMemo(() => formatTime(cleaning.scheduledTime), [cleaning.scheduledTime])
  const staffList = useMemo(() => cleaning.staffList || [], [cleaning.staffList])
  const equipmentCount = cleaning.equipmentCount ?? 0

  return (
    <div
      onClick={onClick}
      className={`cursor-pointer transition-all duration-200 active:scale-[0.98] overflow-hidden rounded-[28px] w-full flex flex-col border shadow-md ${
        isDone
          ? 'bg-slate-50 border-slate-100 opacity-70 shadow-none'
          : 'bg-white border-slate-100 shadow-md'
      }`}
    >
      {/* Photo */}
      <div className="relative h-44 bg-slate-100 overflow-hidden shrink-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            className={`w-full h-full object-cover transition-transform duration-500 hover:scale-105 ${isDone ? 'opacity-50 grayscale-[0.4]' : ''}`}
            alt="Property"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-300 font-black text-xs uppercase tracking-widest">
            Sin Foto
          </div>
        )}
        {cleaning.status && (
          <span className={`absolute top-3 right-3 px-2.5 py-1 text-[10px] font-black tracking-wider rounded-full shadow ${statusClass}`}>
            {isDone && <CheckCircle2 className="w-3 h-3 mr-1 inline" />}
            {cleaning.status.toUpperCase()}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-grow">
        <h3 className={`font-extrabold text-[17px] tracking-tight leading-tight line-clamp-1 mb-1 ${isDone ? 'text-slate-400' : 'text-slate-900'}`}>
          {cleaning.propertyText || 'Propiedad'}
        </h3>
        {cleaning.address && (
          <p className={`text-[11px] font-medium line-clamp-1 mb-3 ${isDone ? 'text-slate-300' : 'text-slate-400'}`}>
            📍 {cleaning.address}
          </p>
        )}

        <div className="mt-auto space-y-2.5">
          {/* Time + Date */}
          <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-tight border-t border-slate-100 pt-2.5">
            <div className="flex items-center gap-1 text-slate-400">
              <Clock className="w-3 h-3" style={{ color: TEAL }} />
              <span>SCHED: <span className="text-slate-700">{formattedTime || '--:--'}</span></span>
            </div>
            <div className="flex items-center gap-1 text-slate-400 border-l border-slate-200 pl-3">
              <Calendar className="w-3 h-3" style={{ color: TEAL }} />
              <span className="text-slate-700">{formattedDate}</span>
            </div>
          </div>

          {/* Staff + Equipment */}
          <div className="flex items-center justify-between border-t border-slate-50 pt-2">
            <div className="flex items-center gap-1">
              {staffList.length > 0 ? (
                staffList.slice(0, 4).map((initials, i) => (
                  <div
                    key={i}
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[9px] font-black text-white"
                    style={{ background: '#9C7FE8', marginLeft: i > 0 ? '-4px' : 0 }}
                  >
                    {initials}
                  </div>
                ))
              ) : (
                <span className="text-[10px] text-slate-300 font-medium">Sin staff</span>
              )}
            </div>
            {equipmentCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                <Package className="w-3 h-3" style={{ color: TEAL }} />
                <span className="text-slate-600">{equipmentCount} equipo{equipmentCount !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

CleaningCard.displayName = 'CleaningCard'
export default CleaningCard
