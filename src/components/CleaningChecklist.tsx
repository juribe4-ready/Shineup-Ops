import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, Home, Play, BarChart2, Flag, Camera,
  Star, BookOpen, Package, CheckCircle2,
  Plus, X, AlertCircle, ChevronRight, MapPin, Clock, Users, Key
} from 'lucide-react'

// ─── Design System ───────────────────────────────────────────────────────────
const C = {
  teal:      '#00BCD4',
  tealDark:  '#0097A7',
  tealLight: '#E0F7FA',
  tealMid:   '#B2EBF2',
  green:     '#00C853',
  amber:     '#F59E0B',
  red:       '#EF4444',
  ink:       '#0F172A',
  slate:     '#475569',
  muted:     '#94A3B8',
  border:    '#E2E8F0',
  bg:        '#F8FAFC',
  white:     '#FFFFFF',
}

const STAFF_ID          = 'rec6CVsLgwP3bZuih'
const CLOUDINARY_CLOUD  = 'dw93dwwrh'
const CLOUDINARY_PRESET = 'shineup-ops'
const MAX_UPLOAD_MB     = 100

// ─── Types ───────────────────────────────────────────────────────────────────
type TabType = 'detalle' | 'inicio' | 'reporte' | 'cierre'
interface Task { id: string; taskName: string; taskGroup: string; order: number }
interface Equipment { text: string; code: string }
interface CleaningDetails {
  id: string; cleaningId: string; propertyText: string; propertyId: string
  closingMediaType: string; bookUrl: string; cleaningTypeText: string; status: string
  address: string; googleMapsUrl: string; date: string; scheduledTime: string
  startTime: string; endTime: string; assignedStaffNames: string[]
  initialComments: string; doorCodes: string; estimatedEndTime: string
  openComments: string; rating: number; videoInicial: string[]
  photosVideos: { url: string; filename: string }[]; equipment: Equipment[]
}
interface Incident {
  id: string; name: string; status: string; creationDate?: string
  comment?: string; photoUrls: string[]; reportedBy?: string
}
interface InventoryRecord {
  id: string; status: string; comment?: string; date?: string
  photoUrls: string[]; reportedBy?: string
}
interface Props {
  cleaning: { id: string; propertyText?: string }
  onBack: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (v?: string | null) => {
  if (!v) return '--:--'
  try { return new Date(v).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '--:--' }
}

const isVideoFile = (file: File) =>
  file.type.startsWith('video/') || /\.(mov|mp4|avi|mkv|webm|m4v|3gp)$/i.test(file.name)

const uploadToCloudinary = (file: File, onProgress: (pct: number) => void): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_PRESET)
  formData.append('folder', 'shineup-ops')
  const resourceType = isVideoFile(file) ? 'video' : 'image'
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText).secure_url)
      else reject(new Error(`Upload failed: ${xhr.status}`))
    }
    xhr.onerror = () => reject(new Error('Upload error'))
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`)
    xhr.send(formData)
  })
}

const saveUrlToAirtable = (cleaningId: string, type: string, publicUrl: string, filename: string) =>
  fetch('/api/saveFileUrl', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleaningId, type, publicUrl, filename })
  })

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-1.5 h-6 rounded-full" style={{ background: C.teal }} />
      <span className="text-[11px] font-black tracking-[0.2em] uppercase" style={{ color: C.teal }}>{children}</span>
    </div>
  )
}

function StepBadge({ n, done }: { n: number; done?: boolean }) {
  return (
    <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 shadow-sm"
      style={{ background: done ? C.green : C.teal }}>
      {done
        ? <CheckCircle2 className="w-5 h-5 text-white" />
        : <span className="text-white font-black text-[15px]">{n}</span>}
    </div>
  )
}

function StepTitle({ children }: { children: React.ReactNode }) {
  return <p className="font-black text-[16px] mb-1" style={{ color: C.ink, fontFamily: 'Poppins, sans-serif' }}>{children}</p>
}

function StepSub({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] font-medium mb-3" style={{ color: C.muted }}>{children}</p>
}

function Divider() {
  return <div className="h-px my-1" style={{ background: C.border }} />
}

function TaskChecklist({ tasks, completedTasks, onToggle }: {
  tasks: Task[]; completedTasks: Set<string>; onToggle: (id: string) => void
}) {
  const grouped = tasks.reduce<Record<string, Task[]>>((acc, t) => {
    const g = t.taskGroup || 'General'
    if (!acc[g]) acc[g] = []
    acc[g].push(t)
    return acc
  }, {})
  return (
    <div className="rounded-3xl shadow-sm overflow-hidden" style={{ background: C.white, border: `1px solid ${C.border}` }}>
      <div className="px-5 py-4" style={{ background: C.tealLight }}>
        <div className="flex items-center justify-between">
          <span className="font-black text-[13px]" style={{ color: C.tealDark }}>CHECKLIST DE LIMPIEZA</span>
          <span className="font-black text-[13px] px-3 py-1 rounded-full" style={{ background: C.teal, color: C.white }}>
            {completedTasks.size}/{tasks.length}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: C.tealMid }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${tasks.length > 0 ? Math.round((completedTasks.size / tasks.length) * 100) : 0}%`, background: C.teal }} />
        </div>
      </div>
      <div className="px-5 py-4 space-y-5">
        {Object.entries(grouped).map(([group, groupTasks]) => (
          <div key={group}>
            <p className="text-[10px] font-black uppercase tracking-[0.15em] mb-2" style={{ color: C.muted }}>{group}</p>
            <div className="space-y-1">
              {groupTasks.map(task => {
                const done = completedTasks.has(task.id)
                return (
                  <label key={task.id} className="flex items-start gap-3 p-2.5 rounded-2xl cursor-pointer transition-all hover:bg-slate-50">
                    <div onClick={() => onToggle(task.id)}
                      className="w-5 h-5 rounded-lg border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all"
                      style={{ borderColor: done ? C.green : C.border, background: done ? C.green : C.white }}>
                      {done && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-[13px] leading-snug font-medium" style={{ color: done ? C.muted : C.slate, textDecoration: done ? 'line-through' : 'none' }}>
                      {task.taskName}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CleaningChecklist({ cleaning, onBack }: Props) {
  const [details, setDetails]               = useState<CleaningDetails | null>(null)
  const [tasks, setTasks]                   = useState<Task[]>([])
  const [loading, setLoading]               = useState(true)
  const [activeTab, setActiveTab]           = useState<TabType>('detalle')
  const [videoThumbs, setVideoThumbs]       = useState<string[]>([])
  const [openComments, setOpenComments]     = useState('')
  const [openCommentsSaved, setOpenCommentsSaved] = useState(false)
  const [rating, setRating]                 = useState(0)
  const [isInProgress, setIsInProgress]     = useState(false)
  const [isDone, setIsDone]                 = useState(false)
  const [startingCleaning, setStartingCleaning] = useState(false)
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [videoProgress, setVideoProgress]   = useState(0)
  const [uploadingClosing, setUploadingClosing] = useState(false)
  const [closingProgress, setClosingProgress] = useState(0)
  const [videoSizeWarning, setVideoSizeWarning] = useState(0)
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set())
  const [incidents, setIncidents]           = useState<Incident[]>([])
  const [inventoryRecords, setInventoryRecords] = useState<InventoryRecord[]>([])
  const [selectedIncident, setSelectedIncident]   = useState<Incident | null>(null)
  const [selectedInventory, setSelectedInventory] = useState<InventoryRecord | null>(null)
  const [showNewIncident, setShowNewIncident]   = useState(false)
  const [showNewInventory, setShowNewInventory] = useState(false)
  const [newIncName, setNewIncName]     = useState('')
  const [newIncComment, setNewIncComment] = useState('')
  const [newIncPhoto, setNewIncPhoto]   = useState<string | null>(null)
  const [newIncPhotoFile, setNewIncPhotoFile] = useState<File | null>(null)
  const [savingIncident, setSavingIncident] = useState(false)
  const [newInvStatus, setNewInvStatus] = useState<'Low' | 'Out of Stock'>('Low')
  const [newInvComment, setNewInvComment] = useState('')
  const [newInvPhoto, setNewInvPhoto]   = useState<string | null>(null)
  const [newInvPhotoFile, setNewInvPhotoFile] = useState<File | null>(null)
  const [savingInventory, setSavingInventory] = useState(false)
  const [closingPhotos, setClosingPhotos] = useState<{ url: string; filename: string }[]>([])
  const [finishing, setFinishing]           = useState(false)
  const [toast, setToast]                   = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const detalleRef = useRef<HTMLDivElement>(null)
  const inicioRef  = useRef<HTMLDivElement>(null)
  const reporteRef = useRef<HTMLDivElement>(null)
  const cierreRef  = useRef<HTMLDivElement>(null)
  const videoInputRef   = useRef<HTMLInputElement>(null)
  const closingInputRef = useRef<HTMLInputElement>(null)
  const incPhotoRef     = useRef<HTMLInputElement>(null)
  const invPhotoRef     = useRef<HTMLInputElement>(null)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => { loadDetails() }, [cleaning.id])
  useEffect(() => {
    const onScroll = () => {
      const offset = 200
      for (const [key, ref] of [['cierre', cierreRef], ['reporte', reporteRef], ['inicio', inicioRef], ['detalle', detalleRef]] as const) {
        if (ref.current && ref.current.getBoundingClientRect().top <= offset) { setActiveTab(key as TabType); break }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const loadDetails = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/getCleaningTasks?cleaningId=${cleaning.id}`)
      if (!res.ok) throw new Error('Error al cargar')
      const result = await res.json()
      const d = result.cleaning
      setDetails(d); setTasks(result.tasks)
      setIsInProgress(d.status === 'In Progress')
      setIsDone(d.status === 'Done')
      if (d.rating) setRating(d.rating)
      if (d.videoInicial?.length) { setVideoThumbs(d.videoInicial); setOpenCommentsSaved(true) }
      setOpenComments(d.openComments || '')
      if (d.photosVideos?.length) setClosingPhotos(d.photosVideos)
      if (d.propertyId) { loadIncidents(d.propertyId); loadInventory(d.propertyId) }
    } catch { showToast('Error al cargar', 'err') }
    finally { setLoading(false) }
  }

  const loadIncidents = async (propertyId: string) => {
    try { const r = await fetch(`/api/getIncidents?propertyId=${propertyId}`); if (r.ok) setIncidents(await r.json()) } catch {}
  }
  const loadInventory = async (propertyId: string) => {
    try { const r = await fetch(`/api/getInventory?propertyId=${propertyId}`); if (r.ok) setInventoryRecords(await r.json()) } catch {}
  }

  const scrollTo = (tab: TabType) => {
    setActiveTab(tab)
    const refs = { detalle: detalleRef, inicio: inicioRef, reporte: reporteRef, cierre: cierreRef }
    const el = refs[tab].current
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 190, behavior: 'smooth' })
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return
    const file = files[0]; const sizeMB = file.size / (1024 * 1024)
    if (isVideoFile(file) && sizeMB > MAX_UPLOAD_MB) { setVideoSizeWarning(Math.round(sizeMB)); if (videoInputRef.current) videoInputRef.current.value = ''; return }
    setUploadingVideo(true); setVideoProgress(0)
    try {
      for (const f of Array.from(files)) {
        const url = await uploadToCloudinary(f, pct => setVideoProgress(pct))
        await saveUrlToAirtable(cleaning.id, 'video', url, f.name)
        setVideoThumbs(prev => [...prev, url])
      }
      showToast('Video subido ✓')
    } catch { showToast('Error al subir', 'err') }
    finally { setUploadingVideo(false); setVideoProgress(0); if (videoInputRef.current) videoInputRef.current.value = '' }
  }

  const handleClosingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files?.length) return
    setUploadingClosing(true); setClosingProgress(0)
    try {
      for (const f of Array.from(files)) {
        const url = await uploadToCloudinary(f, pct => setClosingProgress(pct))
        await saveUrlToAirtable(cleaning.id, 'closing', url, f.name)
        setClosingPhotos(prev => [...prev, { url, filename: f.name }])
      }
      showToast('Archivo subido ✓')
    } catch { showToast('Error al subir', 'err') }
    finally { setUploadingClosing(false); setClosingProgress(0); if (closingInputRef.current) closingInputRef.current.value = '' }
  }

  const handleRating = async (value: number) => {
    setRating(value)
    try { await fetch('/api/updateCleaning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cleaningId: cleaning.id, rating: value }) }) }
    catch { showToast('Error al guardar rating', 'err') }
  }

  const handleStart = async () => {
    setStartingCleaning(true)
    try {
      await fetch('/api/updateCleaning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cleaningId: cleaning.id, startTime: new Date().toISOString(), status: 'In Progress' }) })
      setIsInProgress(true); showToast('¡Limpieza iniciada!')
      setTimeout(() => scrollTo('reporte'), 400)
    } catch { showToast('Error al iniciar', 'err') }
    finally { setStartingCleaning(false) }
  }

  const handleFinish = async () => {
    setFinishing(true)
    try {
      await fetch('/api/updateCleaning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cleaningId: cleaning.id, endTime: new Date().toISOString(), status: 'Done' }) })
      setIsDone(true); showToast('¡Limpieza finalizada!')
      setTimeout(() => onBack(), 1500)
    } catch { showToast('Error al finalizar', 'err') }
    finally { setFinishing(false) }
  }

  const handleIncPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setNewIncPhotoFile(file)
    const reader = new FileReader(); reader.onload = () => setNewIncPhoto(reader.result as string); reader.readAsDataURL(file)
  }
  const handleInvPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setNewInvPhotoFile(file)
    const reader = new FileReader(); reader.onload = () => setNewInvPhoto(reader.result as string); reader.readAsDataURL(file)
  }

  const handleSaveIncident = async () => {
    if (!newIncName.trim()) { showToast('Escribe un nombre', 'err'); return }
    setSavingIncident(true)
    const optimistic: Incident = { id: `tmp-${Date.now()}`, name: newIncName, status: 'Reported', comment: newIncComment, photoUrls: newIncPhoto ? [newIncPhoto] : [] }
    setIncidents(prev => [optimistic, ...prev]); setShowNewIncident(false)
    const name = newIncName; const comment = newIncComment; const photoFile = newIncPhotoFile
    setNewIncName(''); setNewIncComment(''); setNewIncPhoto(null); setNewIncPhotoFile(null)
    try {
      let photoUrl = ''
      if (photoFile) photoUrl = await uploadToCloudinary(photoFile, () => {})
      await fetch('/api/createIncident', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, comment, propertyId: details?.propertyId, cleaningId: cleaning.id, staffId: STAFF_ID, photoUrl }) })
      showToast('Incidente registrado ✓')
    } catch { showToast('Error al guardar', 'err'); setIncidents(prev => prev.filter(r => r.id !== optimistic.id)) }
    finally { setSavingIncident(false) }
  }

  const handleSaveInventory = async () => {
    setSavingInventory(true)
    const optimistic: InventoryRecord = { id: `tmp-${Date.now()}`, status: newInvStatus, comment: newInvComment, date: new Date().toISOString(), photoUrls: newInvPhoto ? [newInvPhoto] : [] }
    setInventoryRecords(prev => [optimistic, ...prev]); setShowNewInventory(false)
    const status = newInvStatus; const comment = newInvComment; const photoFile = newInvPhotoFile
    setNewInvStatus('Low'); setNewInvComment(''); setNewInvPhoto(null); setNewInvPhotoFile(null)
    try {
      let photoUrl = ''
      if (photoFile) photoUrl = await uploadToCloudinary(photoFile, () => {})
      await fetch('/api/addInventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, comment, propertyId: details?.propertyId, cleaningId: cleaning.id, staffId: STAFF_ID, photoUrl }) })
      showToast('Inventario registrado ✓')
    } catch { showToast('Error al guardar', 'err'); setInventoryRecords(prev => prev.filter(r => r.id !== optimistic.id)) }
    finally { setSavingInventory(false) }
  }

  const toggleTask = (id: string) => setCompletedTasks(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const totalTasks = tasks.length; const doneTasks = completedTasks.size
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const tabs = [
    { key: 'detalle' as TabType, label: 'DETALLE', Icon: Home },
    { key: 'inicio'  as TabType, label: 'INICIO',  Icon: Play },
    { key: 'reporte' as TabType, label: 'REPORTE', Icon: BarChart2 },
    { key: 'cierre'  as TabType, label: 'CIERRE',  Icon: Flag },
  ]

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${C.tealDark}, ${C.teal})` }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: 'rgba(255,255,255,0.2)', borderTopColor: 'white' }} />
        <p className="text-white/70 font-semibold text-[13px] tracking-wide">Cargando limpieza...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: C.bg, fontFamily: 'Poppins, sans-serif' }}>

      {/* TOAST */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-2xl shadow-xl text-white text-[13px] font-bold flex items-center gap-2"
          style={{ background: toast.type === 'ok' ? C.green : C.red, backdropFilter: 'blur(10px)' }}>
          {toast.type === 'ok' ? '✓' : '!'} {toast.msg}
        </div>
      )}

      {/* STICKY HEADER */}
      <div className="sticky top-0 z-50 shadow-lg" style={{ background: `linear-gradient(135deg, ${C.tealDark} 0%, ${C.teal} 100%)` }}>
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 pt-10 pb-3">
          <button onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl font-bold text-[13px] shadow-md active:scale-95 transition-all"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)' }}>
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} /> Volver
          </button>
          <div className="text-right max-w-[55%]">
            <p className="text-white font-black text-[14px] leading-tight truncate tracking-tight">
              {(details?.propertyText || 'ShineUP').toUpperCase()}
            </p>
            <p className="text-white/60 text-[10px] font-semibold uppercase tracking-widest mt-0.5 truncate">
              {details?.cleaningTypeText || 'Standard Turnover'}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="px-4 pb-2">
          <div className="flex justify-between mb-1">
            <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Progreso</span>
            <span className="text-[10px] font-black text-white">{doneTasks}/{totalTasks} tareas</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progress}%`, background: progress === 100 ? '#00E676' : 'white' }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="grid grid-cols-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          {tabs.map(({ key, label, Icon }) => {
            const active = activeTab === key
            return (
              <button key={key} onClick={() => scrollTo(key)}
                className="flex flex-col items-center py-3 transition-all relative">
                <Icon className="w-4 h-4 mb-1" style={{ color: active ? 'white' : 'rgba(255,255,255,0.35)', strokeWidth: active ? 2.5 : 1.5 }} />
                <span className="text-[9px] font-black tracking-widest" style={{ color: active ? 'white' : 'rgba(255,255,255,0.35)' }}>{label}</span>
                {active && <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full" style={{ background: '#00E676' }} />}
              </button>
            )
          })}
        </div>
      </div>

      {/* CONTENT */}
      <div className="px-4 pt-6 pb-28 space-y-6">

        {/* ── DETALLE ──────────────────────────────────── */}
        <div ref={detalleRef}>
          <SectionLabel>Detalle</SectionLabel>
          <div className="rounded-3xl overflow-hidden shadow-sm" style={{ background: C.white, border: `1px solid ${C.border}` }}>

            {/* Property header */}
            <div className="px-5 py-4" style={{ background: `linear-gradient(135deg, ${C.tealLight}, ${C.white})` }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 flex-1">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: C.teal }} />
                  <div>
                    <p className="font-black text-[15px] leading-tight" style={{ color: C.ink }}>{details?.propertyText || 'Sin nombre'}</p>
                    {details?.address && <p className="text-[11px] font-medium mt-0.5" style={{ color: C.muted }}>{details.address}</p>}
                  </div>
                </div>
                {details?.googleMapsUrl && (
                  <a href={details.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-2xl shrink-0 active:scale-95 transition-all"
                    style={{ background: C.teal, color: 'white' }}>
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-black">IR</span>
                  </a>
                )}
              </div>
            </div>

            <div className="px-5 py-4 space-y-4">
              {details?.bookUrl && (
                <a href={details.bookUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-[13px] font-bold active:scale-95 transition-all"
                  style={{ background: C.tealLight, color: C.tealDark }}>
                  <BookOpen className="w-4 h-4" /> Ver Book de la Propiedad
                </a>
              )}

              {/* Times table */}
              <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.border}` }}>
                <div className="grid grid-cols-3 px-4 py-2.5" style={{ background: C.bg }}>
                  <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}></span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: C.muted }}>Progr.</span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-center" style={{ color: C.muted }}>Real</span>
                </div>
                {[
                  { label: 'Inicio', prog: details?.scheduledTime, real: details?.startTime },
                  { label: 'Fin',    prog: details?.estimatedEndTime, real: details?.endTime },
                ].map(row => (
                  <div key={row.label} className="grid grid-cols-3 px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" style={{ color: C.muted }} />
                      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: C.muted }}>{row.label}</span>
                    </div>
                    <span className="text-center font-black text-[14px]" style={{ color: C.ink }}>{fmt(row.prog)}</span>
                    <span className="text-center font-bold text-[13px]" style={{ color: C.slate }}>{fmt(row.real)}</span>
                  </div>
                ))}
              </div>

              {/* Staff */}
              {details?.assignedStaffNames?.length ? (
                <div className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: C.bg }}>
                  <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: C.tealLight }}>
                    <Users className="w-4 h-4" style={{ color: C.teal }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-0.5" style={{ color: C.muted }}>Personal</p>
                    <p className="font-bold text-[13px]" style={{ color: C.ink }}>{details.assignedStaffNames.join(', ')}</p>
                  </div>
                </div>
              ) : null}

              {/* Equipment */}
              {details?.equipment?.length ? (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-3.5 h-3.5" style={{ color: C.muted }} />
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Equipamiento</p>
                  </div>
                  <div className="space-y-2">
                    {details.equipment.map((eq, i) => (
                      <div key={i} className="flex items-center justify-between rounded-2xl px-4 py-2.5" style={{ background: '#F3F0FF' }}>
                        <span className="text-[13px] font-semibold" style={{ color: C.ink }}>{eq.text}</span>
                        <span className="text-[12px] font-black" style={{ color: '#7C3AED' }}>{eq.code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Door codes */}
              {details?.doorCodes && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Key className="w-3.5 h-3.5" style={{ color: C.amber }} />
                    <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: C.muted }}>Códigos de Acceso</p>
                  </div>
                  <div className="rounded-2xl px-4 py-3" style={{ background: '#FFFBEB', border: `1px solid #FDE68A` }}>
                    <p className="text-[13px] font-mono leading-relaxed" style={{ color: C.ink }}>{details.doorCodes}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── INICIO ──────────────────────────────────── */}
        <div ref={inicioRef} style={{ opacity: isDone ? 0.5 : 1, pointerEvents: isDone ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
          <SectionLabel>Inicio</SectionLabel>
          <div className="rounded-3xl overflow-hidden shadow-sm space-y-0" style={{ background: C.white, border: `1px solid ${C.border}` }}>

            {/* Step 1 - Video */}
            <div className="p-5">
              <div className="flex gap-4">
                <StepBadge n={1} />
                <div className="flex-1">
                  <StepTitle>Sube el video inicial</StepTitle>
                  <StepSub>Registra el estado de la propiedad al llegar</StepSub>
                  {videoThumbs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {videoThumbs.map((url, i) => {
                        const isVid = url.includes('/video/') || isVideoFile({ name: url } as File)
                        return (
                          <div key={i} className="relative w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center"
                            style={{ border: `2px solid ${C.teal}`, background: isVid ? C.ink : C.bg }}>
                            {isVid ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="text-xl">🎥</span>
                                <span className="text-[8px] font-black text-white">VIDEO</span>
                              </div>
                            ) : (
                              <img src={url} alt="video" className="w-full h-full object-cover" />
                            )}
                            <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: C.green }}>
                              <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {uploadingVideo && (
                    <div className="mb-3 p-3 rounded-2xl" style={{ background: C.tealLight }}>
                      <div className="flex justify-between text-[11px] font-bold mb-1.5" style={{ color: C.tealDark }}>
                        <span>Subiendo...</span><span>{videoProgress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.tealMid }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${videoProgress}%`, background: C.teal }} />
                      </div>
                    </div>
                  )}
                  <input ref={videoInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleVideoUpload} />
                  <button onClick={() => !uploadingVideo && videoInputRef.current?.click()} disabled={uploadingVideo}
                    className="w-full py-3 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-[13px] font-bold transition-all active:scale-98"
                    style={{ borderColor: C.teal, color: C.teal, background: videoThumbs.length > 0 ? C.tealLight : 'transparent', opacity: uploadingVideo ? 0.6 : 1 }}>
                    <Camera className="w-4 h-4" />
                    {uploadingVideo ? `Subiendo ${videoProgress}%...` : videoThumbs.length > 0 ? 'Agregar más archivos' : 'Seleccionar video / foto'}
                  </button>
                </div>
              </div>
            </div>

            <Divider />

            {/* Step 2 - Instrucciones */}
            <div className="p-5">
              <div className="flex gap-4">
                <StepBadge n={2} />
                <div className="flex-1 space-y-3">
                  <StepTitle>Instrucciones Iniciales</StepTitle>
                  <div className="p-3 rounded-2xl" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
                    <p className="text-[13px] font-medium leading-relaxed" style={{ color: C.slate }}>
                      {details?.initialComments || 'Sin instrucciones especiales'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: C.muted }}>Notas de apertura</p>
                    <textarea value={openComments}
                      onChange={e => { setOpenComments(e.target.value); setOpenCommentsSaved(false) }}
                      onBlur={async () => {
                        if (!openCommentsSaved && videoThumbs.length > 0) {
                          try { await fetch('/api/updateCleaning', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cleaningId: cleaning.id, openComments }) }); setOpenCommentsSaved(true) } catch {}
                        }
                      }}
                      disabled={videoThumbs.length === 0 || openCommentsSaved}
                      rows={2} placeholder={videoThumbs.length === 0 ? 'Sube el video para habilitar...' : 'Agrega notas de apertura...'}
                      className="w-full px-4 py-3 text-[13px] rounded-2xl resize-none outline-none transition-all font-medium"
                      style={{ fontFamily: 'Poppins, sans-serif', border: `1.5px solid ${videoThumbs.length === 0 ? C.border : openCommentsSaved ? C.border : C.amber}`, background: videoThumbs.length === 0 || openCommentsSaved ? C.bg : '#FFFBEB', color: C.ink }} />
                    {videoThumbs.length > 0 && openCommentsSaved && (
                      <button onClick={() => setOpenCommentsSaved(false)} className="mt-1.5 text-[11px] font-bold px-3 py-1 rounded-xl" style={{ background: C.tealLight, color: C.teal }}>Modificar</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* Step 3 - Rating */}
            <div className="p-5">
              <div className="flex gap-4">
                <StepBadge n={3} />
                <div className="flex-1">
                  <StepTitle>Califica el estado</StepTitle>
                  <StepSub>¿Cómo encontraste la propiedad?</StepSub>
                  <div className="flex items-center gap-5">
                    {[1, 2, 3].map(v => (
                      <button key={v} onClick={() => handleRating(v)} className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform">
                        <Star className="w-10 h-10" fill={rating >= v ? '#F59E0B' : 'none'} stroke={rating >= v ? '#F59E0B' : C.border} strokeWidth={1.5} />
                        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: rating >= v ? C.amber : C.muted }}>{['Malo', 'Regular', 'Bueno'][v - 1]}</span>
                      </button>
                    ))}
                    {rating > 0 && <span className="font-black text-[22px] ml-2" style={{ color: C.teal }}>{rating}/3</span>}
                  </div>
                </div>
              </div>
            </div>

            <Divider />

            {/* Step 4 - Start */}
            <div className="p-5">
              <div className="flex gap-4">
                <StepBadge n={4} done={isInProgress || isDone} />
                <div className="flex-1">
                  <StepTitle>Iniciar limpieza</StepTitle>
                  <StepSub>Registra la hora de inicio</StepSub>
                  {!isInProgress && !isDone ? (
                    <button onClick={handleStart} disabled={startingCleaning}
                      className="w-full py-4 rounded-2xl text-white font-black text-[15px] flex items-center justify-center gap-2.5 shadow-lg active:scale-95 transition-all"
                      style={{ background: `linear-gradient(135deg, #00C853, #00E676)` }}>
                      {startingCleaning ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><Play className="w-5 h-5" fill="white" /> EMPEZAR LIMPIEZA</>}
                    </button>
                  ) : (
                    <div className="w-full py-3.5 rounded-2xl text-white font-bold text-[13px] flex items-center justify-center gap-2" style={{ background: C.green }}>
                      <CheckCircle2 className="w-4 h-4" /> {isDone ? 'Limpieza completada' : 'Limpieza en progreso'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {isInProgress && tasks.length > 0 && (
            <div className="mt-4"><TaskChecklist tasks={tasks} completedTasks={completedTasks} onToggle={toggleTask} /></div>
          )}
        </div>

        {/* ── REPORTE ──────────────────────────────────── */}
        <div ref={reporteRef}>
          <SectionLabel>Reporte</SectionLabel>

          {/* Inventario */}
          <div className="rounded-3xl overflow-hidden shadow-sm mb-4" style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div>
                <p className="font-black text-[14px]" style={{ color: C.ink }}>Inventario del Cliente</p>
                <p className="text-[11px] font-medium" style={{ color: C.muted }}>Artículos bajos o agotados</p>
              </div>
              <button onClick={() => isInProgress && setShowNewInventory(true)} disabled={!isInProgress}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-white text-[12px] font-bold active:scale-95 transition-all"
                style={{ background: isInProgress ? C.teal : C.muted }}>
                <Plus className="w-3.5 h-3.5" /> Nuevo
              </button>
            </div>
            <div style={{ opacity: isInProgress ? 1 : 0.5 }}>
              {inventoryRecords.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2" style={{ color: C.muted }}>
                  <Package className="w-8 h-8 opacity-30" />
                  <p className="text-[12px] font-medium">Sin registros de inventario</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: C.border }}>
                  {inventoryRecords.map(rec => (
                    <button key={rec.id} onClick={() => setSelectedInventory(rec)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: rec.status === 'Out of Stock' ? C.red : C.amber }} />
                      <span className="flex-1 text-[13px] font-semibold truncate" style={{ color: C.ink }}>{rec.comment || rec.status}</span>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
                        style={{ background: rec.status === 'Out of Stock' ? '#FEE2E2' : '#FEF3C7', color: rec.status === 'Out of Stock' ? C.red : C.amber }}>
                        {rec.status}
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isInProgress && <p className="text-[10px] font-medium text-center pb-3" style={{ color: C.muted }}>Inicia la limpieza para registrar</p>}
          </div>

          {/* Incidentes */}
          <div className="rounded-3xl overflow-hidden shadow-sm" style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <div>
                <p className="font-black text-[14px]" style={{ color: C.ink }}>Incidentes</p>
                <p className="text-[11px] font-medium" style={{ color: C.muted }}>Reporta problemas o daños</p>
              </div>
              <button onClick={() => isInProgress && setShowNewIncident(true)} disabled={!isInProgress}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-white text-[12px] font-bold active:scale-95 transition-all"
                style={{ background: isInProgress ? C.teal : C.muted }}>
                <Plus className="w-3.5 h-3.5" /> Nuevo
              </button>
            </div>
            <div style={{ opacity: isInProgress ? 1 : 0.5 }}>
              {incidents.length === 0 ? (
                <div className="flex flex-col items-center py-10 gap-2" style={{ color: C.muted }}>
                  <AlertCircle className="w-8 h-8 opacity-30" />
                  <p className="text-[12px] font-medium">Sin incidentes registrados</p>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: C.border }}>
                  {incidents.map(inc => (
                    <button key={inc.id} onClick={() => setSelectedIncident(inc)} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50 transition-colors">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: inc.status !== 'Closed' ? C.amber : C.muted }} />
                      <span className="flex-1 text-[13px] font-semibold truncate" style={{ color: C.ink }}>{inc.name}</span>
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-full shrink-0"
                        style={{
                          background: inc.status === 'Reported' ? '#FEF3C7' : inc.status === 'In Progress' ? '#DBEAFE' : '#DCFCE7',
                          color: inc.status === 'Reported' ? C.amber : inc.status === 'In Progress' ? '#2563EB' : C.green
                        }}>
                        {inc.status}
                      </span>
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: C.muted }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isInProgress && <p className="text-[10px] font-medium text-center pb-3" style={{ color: C.muted }}>Inicia la limpieza para interactuar</p>}
          </div>
        </div>

        {/* ── CIERRE ──────────────────────────────────── */}
        <div ref={cierreRef} style={{ opacity: isDone ? 0.5 : 1, pointerEvents: isDone ? 'none' : 'auto', transition: 'opacity 0.3s' }}>
          <SectionLabel>Cierre</SectionLabel>
          <div className="rounded-3xl overflow-hidden shadow-sm p-5 space-y-4" style={{ background: C.white, border: `1px solid ${C.border}` }}>
            <p className="font-semibold text-[14px] leading-relaxed" style={{ color: C.slate }}>
              Verifica que todo esté conforme al Book antes de terminar.
            </p>
            {closingPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {closingPhotos.map((photo, i) => {
                  const isVid = photo.url.includes('/video/') || /\.(mp4|mov|avi|webm)$/i.test(photo.filename || '')
                  return (
                    <div key={i} className="relative w-16 h-16 rounded-2xl overflow-hidden flex items-center justify-center"
                      style={{ border: `2px solid ${C.teal}`, background: isVid ? C.ink : C.bg }}>
                      {isVid ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="text-xl">🎥</span>
                          <span className="text-[8px] font-black text-white">VIDEO</span>
                        </div>
                      ) : (
                        <img src={photo.url} alt={photo.filename} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                      )}
                      <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: C.green }}>
                        <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {uploadingClosing && (
              <div className="p-3 rounded-2xl" style={{ background: C.tealLight }}>
                <div className="flex justify-between text-[11px] font-bold mb-1.5" style={{ color: C.tealDark }}>
                  <span>Subiendo...</span><span>{closingProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.tealMid }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${closingProgress}%`, background: C.teal }} />
                </div>
              </div>
            )}
            <input ref={closingInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleClosingUpload} />
            <button onClick={() => isInProgress && !isDone && !uploadingClosing && closingInputRef.current?.click()}
              disabled={!isInProgress || uploadingClosing || isDone}
              className="w-full py-3.5 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-[13px] font-bold transition-all"
              style={{ borderColor: isInProgress ? C.slate : C.border, color: isInProgress ? C.slate : C.muted, opacity: uploadingClosing ? 0.6 : 1 }}>
              <Camera className="w-4 h-4" />
              {uploadingClosing ? `Subiendo ${closingProgress}%...` :
                details?.closingMediaType?.toLowerCase().includes('photo') ? 'Subir Fotos de Cierre' :
                details?.closingMediaType?.toLowerCase().includes('video') ? 'Subir Video de Cierre' :
                'Subir fotos / videos'}
            </button>
            <button onClick={handleFinish} disabled={!isInProgress || finishing || isDone}
              className="w-full py-4 rounded-2xl text-white font-black text-[15px] flex items-center justify-center gap-2.5 shadow-lg active:scale-95 transition-all"
              style={{ background: isDone ? C.green : isInProgress ? `linear-gradient(135deg, #EF4444, #F87171)` : C.muted }}>
              {isDone ? <><CheckCircle2 className="w-5 h-5" /> LIMPIEZA TERMINADA</>
                : finishing ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : '🏁 TERMINAR LIMPIEZA'}
            </button>
          </div>
        </div>
      </div>

      {/* ── SIZE WARNING MODAL ── */}
      {videoSizeWarning > 0 && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-xs rounded-3xl overflow-hidden shadow-2xl" style={{ background: C.white }}>
            <div className="px-5 pt-5 pb-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">⚠️</span>
                <p className="font-black text-[17px]" style={{ color: C.ink }}>Video muy grande</p>
              </div>
              <p className="text-[13px] font-medium mb-4" style={{ color: C.slate }}>
                Tu video pesa <span className="font-black" style={{ color: C.red }}>{videoSizeWarning}MB</span>. El límite es 100MB.
              </p>
              <div className="space-y-2 mb-4">
                <div className="p-3 rounded-2xl" style={{ background: '#FFFBEB', border: `1px solid #FDE68A` }}>
                  <p className="text-[11px] font-black mb-1" style={{ color: '#92400E' }}>🍎 iPhone:</p>
                  <p className="text-[11px] font-medium leading-relaxed" style={{ color: '#92400E' }}>Configuración → Cámara → Grabar Video → <strong>1080p a 30 fps</strong></p>
                </div>
                <div className="p-3 rounded-2xl" style={{ background: '#EFF6FF', border: `1px solid #BFDBFE` }}>
                  <p className="text-[11px] font-black mb-1" style={{ color: '#1E40AF' }}>🤖 Android:</p>
                  <p className="text-[11px] font-medium leading-relaxed" style={{ color: '#1E40AF' }}>Cámara → ⚙️ → Calidad de video → <strong>FHD 1080p</strong></p>
                </div>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button onClick={() => setVideoSizeWarning(0)}
                className="w-full py-3 rounded-2xl text-white font-black text-[14px]" style={{ background: C.teal }}>
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── INCIDENT DETAIL MODAL ── */}
      {selectedIncident && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedIncident(null)}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl" style={{ background: C.white }} onClick={e => e.stopPropagation()}>
            {selectedIncident.photoUrls && selectedIncident.photoUrls.length > 0 && (
              <div className="w-full h-48 bg-slate-100">
                <img src={selectedIncident.photoUrls[0]} alt="foto incidente" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="font-black text-[17px] flex-1 pr-4" style={{ color: C.ink }}>{selectedIncident.name}</p>
                <button onClick={() => setSelectedIncident(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.bg }}>
                  <X className="w-4 h-4" style={{ color: C.slate }} />
                </button>
              </div>
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-full inline-block mb-3"
                style={{ background: selectedIncident.status === 'Reported' ? '#FEF3C7' : '#DCFCE7', color: selectedIncident.status === 'Reported' ? C.amber : C.green }}>
                {selectedIncident.status}
              </span>
              {selectedIncident.comment && <p className="text-[13px] font-medium leading-relaxed" style={{ color: C.slate }}>{selectedIncident.comment}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── INVENTORY DETAIL MODAL ── */}
      {selectedInventory && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-6" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setSelectedInventory(null)}>
          <div className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl" style={{ background: C.white }} onClick={e => e.stopPropagation()}>
            {selectedInventory.photoUrls && selectedInventory.photoUrls.length > 0 && (
              <div className="w-full h-48 bg-slate-100">
                <img src={selectedInventory.photoUrls[0]} alt="foto inventario" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-5">
              <div className="flex items-start justify-between mb-3">
                <p className="font-black text-[17px] flex-1 pr-4" style={{ color: C.ink }}>{selectedInventory.comment || selectedInventory.status}</p>
                <button onClick={() => setSelectedInventory(null)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.bg }}>
                  <X className="w-4 h-4" style={{ color: C.slate }} />
                </button>
              </div>
              <span className="text-[11px] font-bold px-3 py-1.5 rounded-full inline-block"
                style={{ background: selectedInventory.status === 'Out of Stock' ? '#FEE2E2' : '#FEF3C7', color: selectedInventory.status === 'Out of Stock' ? C.red : C.amber }}>
                {selectedInventory.status}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW INCIDENT MODAL ── */}
      {showNewIncident && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowNewIncident(false)}>
          <div className="w-full max-w-sm rounded-t-3xl shadow-2xl" style={{ background: C.white }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <p className="font-black text-[16px]" style={{ color: C.ink }}>Nuevo Incidente</p>
              <button onClick={() => setShowNewIncident(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.bg }}>
                <X className="w-4 h-4" style={{ color: C.slate }} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.muted }}>Foto del incidente</p>
                {newIncPhoto ? (
                  <div className="relative w-full h-36 rounded-2xl overflow-hidden mb-1" style={{ border: `2px solid ${C.border}` }}>
                    <img src={newIncPhoto} alt="foto" className="w-full h-full object-cover" />
                    <button onClick={() => { setNewIncPhoto(null); setNewIncPhotoFile(null) }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                      style={{ background: C.red }}>
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input ref={incPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleIncPhoto} />
                    <button onClick={() => incPhotoRef.current?.click()}
                      className="w-full py-3 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-[12px] font-bold"
                      style={{ borderColor: C.border, color: C.muted }}>
                      <Camera className="w-4 h-4" /> Agregar foto
                    </button>
                  </>
                )}
              </div>
              <input type="text" value={newIncName} onChange={e => setNewIncName(e.target.value)}
                placeholder="Nombre del incidente *"
                className="w-full px-4 py-3 text-[13px] rounded-2xl outline-none font-medium transition-all"
                style={{ fontFamily: 'Poppins, sans-serif', border: `1.5px solid ${C.border}`, color: C.ink, background: C.white }} />
              <textarea value={newIncComment} onChange={e => setNewIncComment(e.target.value)}
                placeholder="Descripción..." rows={3}
                className="w-full px-4 py-3 text-[13px] rounded-2xl outline-none font-medium resize-none transition-all"
                style={{ fontFamily: 'Poppins, sans-serif', border: `1.5px solid ${C.border}`, color: C.ink, background: C.white }} />
            </div>
            <div className="px-5 pb-8">
              <button onClick={handleSaveIncident} disabled={savingIncident}
                className="w-full py-3.5 rounded-2xl text-white font-black text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-all"
                style={{ background: C.teal }}>
                {savingIncident ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Guardar Incidente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── NEW INVENTORY MODAL ── */}
      {showNewInventory && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center" style={{ background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => setShowNewInventory(false)}>
          <div className="w-full max-w-sm rounded-t-3xl shadow-2xl" style={{ background: C.white }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
              <p className="font-black text-[16px]" style={{ color: C.ink }}>Nuevo Inventario</p>
              <button onClick={() => setShowNewInventory(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.bg }}>
                <X className="w-4 h-4" style={{ color: C.slate }} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: C.muted }}>Foto del almacén</p>
                {newInvPhoto ? (
                  <div className="relative w-full h-36 rounded-2xl overflow-hidden mb-1" style={{ border: `2px solid ${C.border}` }}>
                    <img src={newInvPhoto} alt="foto" className="w-full h-full object-cover" />
                    <button onClick={() => { setNewInvPhoto(null); setNewInvPhotoFile(null) }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center shadow-md"
                      style={{ background: C.red }}>
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input ref={invPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleInvPhoto} />
                    <button onClick={() => invPhotoRef.current?.click()}
                      className="w-full py-3 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-[12px] font-bold"
                      style={{ borderColor: C.border, color: C.muted }}>
                      <Camera className="w-4 h-4" /> Agregar foto
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {(['Low', 'Out of Stock'] as const).map(s => (
                  <button key={s} onClick={() => setNewInvStatus(s)}
                    className="flex-1 py-2.5 rounded-2xl text-[12px] font-bold transition-all"
                    style={{
                      border: `1.5px solid ${newInvStatus === s ? (s === 'Out of Stock' ? C.red : C.amber) : C.border}`,
                      background: newInvStatus === s ? (s === 'Out of Stock' ? '#FEE2E2' : '#FEF3C7') : C.bg,
                      color: newInvStatus === s ? (s === 'Out of Stock' ? C.red : C.amber) : C.muted
                    }}>
                    {s}
                  </button>
                ))}
              </div>
              <textarea value={newInvComment} onChange={e => setNewInvComment(e.target.value)}
                placeholder="¿Qué falta o está bajo?" rows={3}
                className="w-full px-4 py-3 text-[13px] rounded-2xl outline-none font-medium resize-none transition-all"
                style={{ fontFamily: 'Poppins, sans-serif', border: `1.5px solid ${C.border}`, color: C.ink, background: C.white }} />
            </div>
            <div className="px-5 pb-8">
              <button onClick={handleSaveInventory} disabled={savingInventory}
                className="w-full py-3.5 rounded-2xl text-white font-black text-[14px] flex items-center justify-center gap-2 active:scale-95 transition-all"
                style={{ background: C.teal }}>
                {savingInventory ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
