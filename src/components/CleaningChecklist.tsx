import { useState, useEffect, useRef } from 'react'
import {
  ArrowLeft, Home, Play, BarChart2, Flag, Camera,
  Star, BookOpen, Package, CheckCircle2, MessageSquare,
  Plus, X, AlertCircle, ChevronRight
} from 'lucide-react'

const TEAL       = '#00BCD4'
const TEAL_DARK  = '#0097A7'
const TEAL_LIGHT = '#E0F7FA'
const GREEN      = '#4CAF50'
const STAFF_ID   = 'rec6CVsLgwP3bZuih'

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

const formatTime = (v?: string | null) => {
  if (!v) return '--:--'
  try { return new Date(v).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }
  catch { return '--:--' }
}

const CLOUDINARY_CLOUD = 'dw93dwwrh'
const CLOUDINARY_PRESET = 'shineup-ops'

// Comprime video antes de subir usando canvas (para videos cortos)
// Para videos largos simplemente los sube directamente
const uploadToCloudinary = async (
  file: File,
  onProgress: (pct: number) => void
): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', CLOUDINARY_PRESET)
  formData.append('folder', 'shineup-ops')

  // Si es video, limitar calidad
  if (file.type.startsWith('video/')) {
    formData.append('resource_type', 'video')
    formData.append('transformation', JSON.stringify([
      { quality: 'auto:low', width: 1280, crop: 'limit' }
    ]))
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const data = JSON.parse(xhr.responseText)
        resolve(data.secure_url)
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.responseText}`))
      }
    }
    xhr.onerror = () => reject(new Error('Upload error'))
    const resourceType = file.type.startsWith('video/') ? 'video' : 'image'
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/${resourceType}/upload`)
    xhr.send(formData)
  })
}

const saveUrlToAirtable = async (cleaningId: string, type: string, publicUrl: string, filename: string) => {
  const res = await fetch('/api/saveFileUrl', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleaningId, type, publicUrl, filename })
  })
  if (!res.ok) throw new Error('Error guardando en Airtable')
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-1 h-5 rounded-full" style={{ background: TEAL }} />
      <span className="text-[13px] font-black tracking-widest uppercase" style={{ color: TEAL }}>{children}</span>
    </div>
  )
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <span className="font-black text-slate-800 text-[13px]">Checklist — {completedTasks.size}/{tasks.length} completadas</span>
      </div>
      <div className="px-4 py-3 space-y-4">
        {Object.entries(grouped).map(([group, groupTasks]) => (
          <div key={group}>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{group}</p>
            <div className="space-y-1">
              {groupTasks.map(task => {
                const done = completedTasks.has(task.id)
                return (
                  <label key={task.id} className="flex items-start gap-3 p-2 rounded-xl hover:bg-slate-50 cursor-pointer">
                    <div onClick={() => onToggle(task.id)}
                      className="w-5 h-5 rounded-md border-2 shrink-0 mt-0.5 flex items-center justify-center transition-all"
                      style={{ borderColor: done ? '#00E676' : '#CBD5E1', background: done ? '#00E676' : 'white' }}>
                      {done && <CheckCircle2 className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-[13px] leading-snug ${done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{task.taskName}</span>
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
  const [videoProgress, setVideoProgress] = useState(0)
  const [closingProgress, setClosingProgress] = useState(0)
  const [uploadingClosing, setUploadingClosing] = useState(false)
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
  const [savingIncident, setSavingIncident] = useState(false)
  const [newInvStatus, setNewInvStatus] = useState<'Low' | 'Out of Stock'>('Low')
  const [newInvComment, setNewInvComment] = useState('')
  const [newInvPhoto, setNewInvPhoto]   = useState<string | null>(null)
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
      const offset = 220
      const sections = [
        { key: 'cierre' as TabType, ref: cierreRef },
        { key: 'reporte' as TabType, ref: reporteRef },
        { key: 'inicio' as TabType, ref: inicioRef },
        { key: 'detalle' as TabType, ref: detalleRef },
      ]
      for (const s of sections) {
        if (s.ref.current && s.ref.current.getBoundingClientRect().top <= offset) {
          setActiveTab(s.key); break
        }
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
      setDetails(d)
      setTasks(result.tasks)
      setIsInProgress(d.status === 'In Progress')
      setIsDone(d.status === 'Done')
      if (d.rating) setRating(d.rating)
      if (d.videoInicial?.length) { setVideoThumbs(d.videoInicial); setOpenCommentsSaved(true) }
      setOpenComments(d.openComments || '')
      if (d.photosVideos?.length) setClosingPhotos(d.photosVideos)
      if (d.propertyId) { loadIncidents(d.propertyId); loadInventory(d.propertyId) }
    } catch (err: any) {
      showToast('Error al cargar la limpieza', 'err')
    } finally {
      setLoading(false)
    }
  }

  const loadIncidents = async (propertyId: string) => {
    try {
      const res = await fetch(`/api/getIncidents?propertyId=${propertyId}`)
      if (res.ok) setIncidents(await res.json())
    } catch {}
  }

  const loadInventory = async (propertyId: string) => {
    try {
      const res = await fetch(`/api/getInventory?propertyId=${propertyId}`)
      if (res.ok) setInventoryRecords(await res.json())
    } catch {}
  }

  const scrollToSection = (tab: TabType) => {
    setActiveTab(tab)
    const refMap = { detalle: detalleRef, inicio: inicioRef, reporte: reporteRef, cierre: cierreRef }
    const el = refMap[tab].current
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.pageYOffset - 200, behavior: 'smooth' })
  }

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setUploadingVideo(true)
    setVideoProgress(0)
    try {
      for (const file of Array.from(files)) {
        const url = await uploadToCloudinary(file, (pct) => setVideoProgress(pct))
        await saveUrlToAirtable(cleaning.id, 'video', url, file.name)
        setVideoThumbs(prev => [...prev, url])
      }
      showToast('Video subido correctamente')
    } catch (err: any) {
      console.error(err)
      showToast('Error al subir video', 'err')
    } finally {
      setUploadingVideo(false)
      setVideoProgress(0)
      if (videoInputRef.current) videoInputRef.current.value = ''
    }
  }

  const handleClosingUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    setUploadingClosing(true)
    setClosingProgress(0)
    try {
      for (const file of Array.from(files)) {
        const url = await uploadToCloudinary(file, (pct) => setClosingProgress(pct))
        await saveUrlToAirtable(cleaning.id, 'closing', url, file.name)
        setClosingPhotos(prev => [...prev, { url, filename: file.name }])
      }
      showToast('Archivo subido correctamente')
    } catch (err: any) {
      console.error(err)
      showToast('Error al subir archivo', 'err')
    } finally {
      setUploadingClosing(false)
      setClosingProgress(0)
      if (closingInputRef.current) closingInputRef.current.value = ''
    }
  }

  const handleRating = async (value: number) => {
    setRating(value)
    try {
      await fetch(`/api/updateCleaning`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleaningId: cleaning.id, rating: value })
      })
    } catch { showToast('Error al guardar rating', 'err') }
  }

  const handleStart = async () => {
    setStartingCleaning(true)
    try {
      await fetch(`/api/updateCleaning`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleaningId: cleaning.id, startTime: new Date().toISOString(), status: 'In Progress' })
      })
      setIsInProgress(true)
      showToast('Limpieza iniciada!')
      setTimeout(() => scrollToSection('reporte'), 300)
    } catch { showToast('Error al iniciar', 'err') }
    finally { setStartingCleaning(false) }
  }

  const handleFinish = async () => {
    setFinishing(true)
    try {
      await fetch(`/api/updateCleaning`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleaningId: cleaning.id, endTime: new Date().toISOString(), status: 'Done' })
      })
      setIsDone(true)
      showToast('Limpieza finalizada!')
      setTimeout(() => onBack(), 1500)
    } catch { showToast('Error al finalizar', 'err') }
    finally { setFinishing(false) }
  }

  const handleIncPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setNewIncPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleInvPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setNewInvPhoto(reader.result as string)
    reader.readAsDataURL(file)
  }

  const handleSaveIncident = async () => {
    if (!newIncName.trim()) { showToast('Escribe un nombre para el incidente', 'err'); return }
    setSavingIncident(true)
    const optimistic: Incident = { id: `tmp-${Date.now()}`, name: newIncName, status: 'Reported', comment: newIncComment, photoUrls: [] }
    setIncidents(prev => [optimistic, ...prev])
    setShowNewIncident(false)
    const name = newIncName; const comment = newIncComment
    setNewIncName(''); setNewIncComment(''); setNewIncPhoto(null)
    try {
      await fetch(`/api/createIncident`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, comment, propertyId: details?.propertyId, cleaningId: cleaning.id, staffId: STAFF_ID })
      })
      showToast('Incidente registrado')
    } catch {
      showToast('Error al guardar', 'err')
      setIncidents(prev => prev.filter(r => r.id !== optimistic.id))
    } finally { setSavingIncident(false) }
  }

  const handleSaveInventory = async () => {
    setSavingInventory(true)
    const optimistic: InventoryRecord = { id: `tmp-${Date.now()}`, status: newInvStatus, comment: newInvComment, date: new Date().toISOString(), photoUrls: [] }
    setInventoryRecords(prev => [optimistic, ...prev])
    setShowNewInventory(false)
    const status = newInvStatus; const comment = newInvComment
    setNewInvStatus('Low'); setNewInvComment(''); setNewInvPhoto(null)
    try {
      await fetch(`/api/addInventory`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comment, propertyId: details?.propertyId, cleaningId: cleaning.id, staffId: STAFF_ID })
      })
      showToast('Inventario registrado')
    } catch {
      showToast('Error al guardar', 'err')
      setInventoryRecords(prev => prev.filter(r => r.id !== optimistic.id))
    } finally { setSavingInventory(false) }
  }

  const toggleTask = (id: string) => {
    setCompletedTasks(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const totalTasks = tasks.length
  const doneTasks  = completedTasks.size
  const progress   = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

  const tabs: { key: TabType; label: string; Icon: any }[] = [
    { key: 'detalle', label: 'DETALLE', Icon: Home },
    { key: 'inicio',  label: 'INICIO',  Icon: Play },
    { key: 'reporte', label: 'REPORTE', Icon: BarChart2 },
    { key: 'cierre',  label: 'CIERRE',  Icon: Flag },
  ]

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: `linear-gradient(145deg, ${TEAL_DARK}, ${TEAL})` }}>
      <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F0F4F8]" style={{ fontFamily: "'Poppins', sans-serif" }}>

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl shadow-lg text-white text-[13px] font-bold"
          style={{ background: toast.type === 'ok' ? '#00C853' : '#F44336' }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div className="sticky top-0 z-50 rounded-b-3xl shadow-xl"
        style={{ background: `linear-gradient(145deg, ${TEAL_DARK} 0%, ${TEAL} 60%, #26C6DA 100%)` }}>
        <div className="flex items-center justify-between px-4 pt-10 pb-3">
          <button onClick={onBack}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm shadow-lg active:scale-95 transition-transform"
            style={{ background: 'rgba(255,255,255,0.95)', color: TEAL }}>
            <ArrowLeft className="w-5 h-5" strokeWidth={3} /><span>Volver</span>
          </button>
          <div className="text-right">
            <span className="text-white font-black text-base tracking-tight block leading-tight">{(details?.propertyText || 'ShineUP').toUpperCase()}</span>
            <p className="text-white/80 text-[10px] font-semibold uppercase tracking-wide mt-0.5">{details?.cleaningTypeText || 'Standard STR Turnover'}</p>
          </div>
        </div>
        <div className="px-4 pb-2">
          <div className="flex justify-between text-white/80 text-[10px] font-bold mb-1 uppercase tracking-wide">
            <span>Progreso</span><span>{doneTasks} / {totalTasks}</span>
          </div>
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: progress === 100 ? '#00E676' : 'rgba(255,255,255,0.9)' }} />
          </div>
        </div>
        <div className="grid grid-cols-4">
          {tabs.map(({ key, label, Icon }) => {
            const active = activeTab === key
            return (
              <button key={key} onClick={() => scrollToSection(key)} className="flex flex-col items-center py-2.5 transition-all">
                <Icon className="w-5 h-5 mb-0.5" style={{ color: active ? 'white' : 'rgba(255,255,255,0.4)', strokeWidth: active ? 2.5 : 1.5 }} />
                <span className="text-[9px] font-black tracking-widest" style={{ color: active ? 'white' : 'rgba(255,255,255,0.4)' }}>{label}</span>
                {active && <div className="w-6 h-0.5 rounded-full mt-1" style={{ background: '#00E676' }} />}
              </button>
            )
          })}
        </div>
      </div>

      <div className="px-4 pt-5 pb-24 space-y-6">

        {/* DETALLE */}
        <div ref={detalleRef}>
          <SectionTitle>DETALLE</SectionTitle>
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 flex-1">
                <span className="text-base mt-0.5">📍</span>
                <div>
                  <p className="font-bold text-slate-800 text-[14px] leading-snug">{details?.propertyText || 'Sin nombre'}</p>
                  {details?.address && <p className="text-[11px] text-slate-400 mt-0.5">{details.address}</p>}
                </div>
              </div>
              {details?.googleMapsUrl && (
                <a href={details.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shrink-0 active:scale-95 transition-all shadow-sm"
                  style={{ background: TEAL, color: 'white' }}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  <span className="text-[11px] font-black tracking-wide">IR</span>
                </a>
              )}
            </div>
            {details?.bookUrl && (
              <a href={details.bookUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-[13px] font-black active:scale-95 transition-all shadow-md"
                style={{ background: TEAL_LIGHT, color: TEAL }}>
                <BookOpen className="w-4 h-4" /> Ver Book de la Propiedad
              </a>
            )}
            <div className="rounded-xl overflow-hidden border border-slate-200">
              <table className="w-full text-[11px]">
                <thead><tr className="bg-slate-50">
                  <th className="text-left px-4 py-2 font-bold text-slate-400 uppercase tracking-wide"></th>
                  <th className="text-center px-3 py-2 font-black text-slate-600 uppercase">Progr.</th>
                  <th className="text-center px-3 py-2 font-black text-slate-600 uppercase">Real</th>
                </tr></thead>
                <tbody>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-400 uppercase tracking-wide">INICIO</td>
                    <td className="px-3 py-3 text-center font-black text-slate-900">{formatTime(details?.scheduledTime)}</td>
                    <td className="px-3 py-3 text-center font-bold text-slate-500">{formatTime(details?.startTime)}</td>
                  </tr>
                  <tr className="border-t border-slate-100">
                    <td className="px-4 py-3 font-semibold text-slate-400 uppercase tracking-wide">FIN</td>
                    <td className="px-3 py-3 text-center font-black text-slate-900">{formatTime(details?.estimatedEndTime)}</td>
                    <td className="px-3 py-3 text-center font-bold text-slate-500">{formatTime(details?.endTime)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {details?.assignedStaffNames?.length ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: TEAL_LIGHT }}>
                  <span style={{ color: TEAL }}>👥</span>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Personal Asignado</p>
                  <p className="font-bold text-slate-800 text-[14px]">{details.assignedStaffNames.join(', ')}</p>
                </div>
              </div>
            ) : null}
            {details?.equipment?.length ? (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: TEAL_LIGHT }}>
                  <Package className="w-4 h-4" style={{ color: TEAL }} />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Equipamiento</p>
                  <div className="space-y-2">
                    {details.equipment.map((eq, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: '#F3F0FF' }}>
                        <span className="text-[13px] font-semibold text-slate-700">{eq.text}</span>
                        <span className="text-[12px] font-black" style={{ color: '#9C7FE8' }}>{eq.code}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {details?.doorCodes && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#FFF3E0' }}>
                  <span className="text-base">🔑</span>
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Codigos de Acceso</p>
                  <div className="rounded-xl px-3 py-3 bg-amber-50 border border-amber-100">
                    <p className="text-[13px] text-slate-700 leading-relaxed font-mono">{details.doorCodes}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* INICIO */}
        <div ref={inicioRef} style={{ filter: isDone ? 'grayscale(1)' : 'none', opacity: isDone ? 0.5 : 1, pointerEvents: isDone ? 'none' : 'auto', transition: 'all 0.3s' }}>
          <SectionTitle>INICIO</SectionTitle>
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-6">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-black text-[13px]" style={{ background: TEAL }}>1</div>
              <div className="flex-1">
                <p className="font-bold text-slate-800 text-[15px] mb-0.5">Sube el video inicial</p>
                <p className="text-[12px] text-slate-400 mb-3">Registra como encontraste la propiedad</p>
                {videoThumbs.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {videoThumbs.map((url, i) => (
                      <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border-2 bg-slate-100" style={{ borderColor: TEAL }}>
                        <img src={url} alt="video" className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10"><span className="text-xl">🎥</span></div>
                        <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                          <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={videoInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleVideoUpload} />
                {uploadingVideo && (
                  <div className="mb-3">
                    <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                      <span>Subiendo...</span><span>{videoProgress}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${videoProgress}%`, background: TEAL }} />
                    </div>
                  </div>
                )}
                <button onClick={() => !uploadingVideo && videoInputRef.current?.click()} disabled={uploadingVideo}
                  className="w-full py-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-[13px] font-bold transition-all"
                  style={{ borderColor: TEAL, color: TEAL, background: videoThumbs.length > 0 ? TEAL_LIGHT : 'transparent', opacity: uploadingVideo ? 0.6 : 1 }}>
                  <Camera className="w-4 h-4" /> {uploadingVideo ? `Subiendo ${videoProgress}%...` : 'Seleccionar video / foto'}
                </button>
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white" style={{ background: '#FF9800' }}>
                <MessageSquare className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Instrucciones iniciales</p>
                  <div className="rounded-xl px-3 py-2 bg-slate-50 border border-slate-100">
                    <p className="text-[12px] text-slate-500 leading-relaxed">{details?.initialComments || 'Sin instrucciones'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                    Notas de apertura
                    {videoThumbs.length > 0 && !openCommentsSaved && <span className="ml-1 text-amber-400">— se guarda al salir</span>}
                  </p>
                  <textarea value={openComments}
                    onChange={e => { setOpenComments(e.target.value); setOpenCommentsSaved(false) }}
                    onBlur={async () => {
                      if (!openCommentsSaved && videoThumbs.length > 0) {
                        try {
                          await fetch(`/api/updateCleaning`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cleaningId: cleaning.id, openComments }) })
                          setOpenCommentsSaved(true)
                        } catch {}
                      }
                    }}
                    disabled={videoThumbs.length === 0 || openCommentsSaved}
                    rows={2} placeholder={videoThumbs.length === 0 ? 'Sube el video para habilitar...' : 'Agrega notas...'}
                    className="w-full px-3 py-2 text-[12px] rounded-xl border transition-all resize-none outline-none"
                    style={{ fontFamily: "'Poppins', sans-serif", borderColor: videoThumbs.length === 0 ? '#E2E8F0' : openCommentsSaved ? '#E2E8F0' : '#FF9800', background: videoThumbs.length === 0 || openCommentsSaved ? '#F8FAFC' : '#FFFBF5' }} />
                  {videoThumbs.length > 0 && openCommentsSaved && (
                    <button onClick={() => setOpenCommentsSaved(false)} className="mt-1 px-3 py-1 rounded-lg text-[11px] font-bold" style={{ background: TEAL_LIGHT, color: TEAL }}>Modificar</button>
                  )}
                </div>
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-black text-[13px]" style={{ background: rating > 0 ? GREEN : TEAL }}>
                {rating > 0 ? '✓' : '2'}
              </div>
              <div className="flex-1">
                <p className="font-bold text-slate-800 text-[15px] mb-3">Califica el estado de la propiedad</p>
                <div className="flex items-center gap-4">
                  {[1, 2, 3].map(v => (
                    <button key={v} onClick={() => handleRating(v)} className="flex flex-col items-center gap-1 active:scale-90 transition-transform">
                      <Star className="w-10 h-10" fill={rating >= v ? '#FFD700' : 'none'} stroke={rating >= v ? '#FFD700' : '#CBD5E1'} strokeWidth={1.5} />
                      <span className="text-[11px] text-slate-400 font-semibold">{['Malo', 'Regular', 'Bueno'][v - 1]}</span>
                    </button>
                  ))}
                  {rating > 0 && <span className="text-[20px] font-black ml-1" style={{ color: TEAL }}>{rating}/3</span>}
                </div>
              </div>
            </div>
            <div className="h-px bg-slate-100" />
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white font-black text-[13px]" style={{ background: isInProgress ? GREEN : TEAL }}>
                {isInProgress ? '✓' : '3'}
              </div>
              <div className="flex-1">
                <p className="font-bold text-slate-800 text-[15px] mb-3">Inicia la limpieza</p>
                {!isInProgress && !isDone ? (
                  <button onClick={handleStart} disabled={startingCleaning}
                    className="w-full py-4 rounded-2xl text-white font-black text-[15px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                    style={{ background: '#00E676' }}>
                    {startingCleaning ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <><Play className="w-4 h-4" fill="white" /> EMPEZAR LIMPIEZA</>}
                  </button>
                ) : (
                  <div className="w-full py-3 rounded-2xl text-white font-bold text-[13px] flex items-center justify-center gap-2" style={{ background: '#00C853' }}>
                    <CheckCircle2 className="w-4 h-4" /> {isDone ? 'Limpieza completada' : 'Limpieza en progreso'}
                  </div>
                )}
              </div>
            </div>
          </div>
          {isInProgress && tasks.length > 0 && (
            <div className="mt-3"><TaskChecklist tasks={tasks} completedTasks={completedTasks} onToggle={toggleTask} /></div>
          )}
        </div>

        {/* REPORTE */}
        <div ref={reporteRef}>
          <SectionTitle>REPORTE</SectionTitle>
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-3">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-[13px] font-black text-slate-800">Inventario del Cliente</span>
              <button onClick={() => isInProgress && setShowNewInventory(true)} disabled={!isInProgress}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[12px] font-bold active:scale-95 transition-all"
                style={{ background: isInProgress ? TEAL : '#CBD5E1' }}>
                <Plus className="w-3.5 h-3.5" /> Nuevo
              </button>
            </div>
            <div style={{ opacity: isInProgress ? 1 : 0.55 }}>
              {inventoryRecords.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-slate-400"><Package className="w-8 h-8 mb-2 opacity-30" /><p className="text-[12px]">Sin registros de inventario</p></div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {inventoryRecords.map(rec => (
                    <button key={rec.id} onClick={() => setSelectedInventory(rec)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: rec.status === 'Out of Stock' ? '#EF4444' : '#F59E0B' }} />
                      <span className="flex-1 text-[13px] font-semibold text-slate-700 truncate">{rec.comment || rec.status}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${rec.status === 'Out of Stock' ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}`}>{rec.status}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isInProgress && <p className="text-[10px] text-slate-400 text-center pb-3">Inicia la limpieza para registrar</p>}
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-[13px] font-black text-slate-800">Incidentes</span>
              <button onClick={() => isInProgress && setShowNewIncident(true)} disabled={!isInProgress}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white text-[12px] font-bold active:scale-95 transition-all"
                style={{ background: isInProgress ? TEAL : '#CBD5E1' }}>
                <Plus className="w-3.5 h-3.5" /> Nuevo
              </button>
            </div>
            <div style={{ opacity: isInProgress ? 1 : 0.55 }}>
              {incidents.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-slate-400"><AlertCircle className="w-8 h-8 mb-2 opacity-30" /><p className="text-[12px]">Sin incidentes registrados</p></div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {incidents.map(inc => (
                    <button key={inc.id} onClick={() => setSelectedIncident(inc)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: inc.status !== 'Closed' ? '#FBA730' : '#CBD5E1' }} />
                      <span className="flex-1 text-[13px] font-semibold text-slate-700 truncate">{inc.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${inc.status === 'Reported' ? 'bg-amber-50 text-amber-600' : inc.status === 'In Progress' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>{inc.status}</span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!isInProgress && <p className="text-[10px] text-slate-400 text-center pb-3">Inicia la limpieza para interactuar</p>}
          </div>
        </div>

        {/* CIERRE */}
        <div ref={cierreRef} style={{ filter: isDone ? 'grayscale(1)' : 'none', opacity: isDone ? 0.5 : 1, pointerEvents: isDone ? 'none' : 'auto', transition: 'all 0.3s' }}>
          <SectionTitle>CIERRE</SectionTitle>
          <div className="bg-white rounded-2xl p-5 shadow-sm space-y-4">
            <p className="font-bold text-slate-800 text-[15px] leading-snug">Verifica que todo este conforme al Book antes de terminar.</p>
            {closingPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {closingPhotos.map((photo, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border-2 bg-slate-100" style={{ borderColor: TEAL }}>
                    <img src={photo.url} alt={photo.filename} className="w-full h-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-green-500 flex items-center justify-center"><CheckCircle2 className="w-2.5 h-2.5 text-white" /></div>
                  </div>
                ))}
              </div>
            )}
            <input ref={closingInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleClosingUpload} />
            {uploadingClosing && (
              <div className="mb-2">
                <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                  <span>Subiendo...</span><span>{closingProgress}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${closingProgress}%`, background: TEAL }} />
                </div>
              </div>
            )}
            <button onClick={() => isInProgress && !isDone && !uploadingClosing && closingInputRef.current?.click()}
              disabled={!isInProgress || uploadingClosing || isDone}
              className="w-full py-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-[13px] font-bold transition-all"
              style={{ borderColor: isInProgress ? '#94A3B8' : '#CBD5E1', color: isInProgress ? '#64748B' : '#CBD5E1', opacity: uploadingClosing ? 0.6 : 1 }}>
              <Camera className="w-4 h-4" />
              {uploadingClosing ? `Subiendo ${closingProgress}%...` : details?.closingMediaType?.toLowerCase().includes('photo') ? 'Subir Fotos' : details?.closingMediaType?.toLowerCase().includes('video') ? 'Subir Videos' : 'Subir fotos / videos'}
            </button>
            <button onClick={handleFinish} disabled={!isInProgress || finishing || isDone}
              className="w-full py-4 rounded-2xl text-white font-black text-[15px] flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
              style={{ background: isDone ? '#00C853' : isInProgress ? '#F44336' : '#BDBDBD' }}>
              {isDone ? <><CheckCircle2 className="w-5 h-5" /> LIMPIEZA TERMINADA</> : finishing ? <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : '🏁 TERMINAR LIMPIEZA'}
            </button>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {selectedIncident && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setSelectedIncident(null)}>
          <div className="w-full max-w-sm bg-white rounded-t-2xl shadow-xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <p className="font-black text-[15px] text-slate-800 flex-1 pr-4">{selectedIncident.name}</p>
              <button onClick={() => setSelectedIncident(null)} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-3 h-3 text-slate-500" /></button>
            </div>
            {selectedIncident.comment && <p className="text-[13px] text-slate-600 mb-3">{selectedIncident.comment}</p>}
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${selectedIncident.status === 'Reported' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>{selectedIncident.status}</span>
          </div>
        </div>
      )}

      {selectedInventory && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setSelectedInventory(null)}>
          <div className="w-full max-w-sm bg-white rounded-t-2xl shadow-xl p-4 pb-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <p className="font-black text-[15px] text-slate-800 flex-1 pr-4">{selectedInventory.comment || selectedInventory.status}</p>
              <button onClick={() => setSelectedInventory(null)} className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-3 h-3 text-slate-500" /></button>
            </div>
            <span className={`text-[11px] font-bold px-2 py-1 rounded-full ${selectedInventory.status === 'Out of Stock' ? 'bg-red-100 text-red-500' : 'bg-amber-100 text-amber-600'}`}>{selectedInventory.status}</span>
          </div>
        </div>
      )}

      {showNewIncident && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowNewIncident(false)}>
          <div className="w-full max-w-sm bg-white rounded-t-2xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="font-black text-slate-800">Nuevo Incidente</span>
              <button onClick={() => setShowNewIncident(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-500" /></button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1">Foto del incidente</p>
                {newIncPhoto ? (
                  <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 mb-2">
                    <img src={newIncPhoto} alt="foto" className="w-full h-full object-cover" />
                    <button onClick={() => setNewIncPhoto(null)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><X className="w-3 h-3 text-white" /></button>
                  </div>
                ) : (
                  <>
                    <input ref={incPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleIncPhoto} />
                    <button onClick={() => incPhotoRef.current?.click()} className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-400">
                      <Camera className="w-3.5 h-3.5" /> Agregar foto
                    </button>
                  </>
                )}
              </div>
              <input type="text" value={newIncName} onChange={e => setNewIncName(e.target.value)} placeholder="Nombre del incidente *"
                className="w-full px-3 py-2 text-[13px] rounded-xl border border-slate-200 outline-none focus:border-teal-400 transition-all"
                style={{ fontFamily: "'Poppins', sans-serif" }} />
              <textarea value={newIncComment} onChange={e => setNewIncComment(e.target.value)} placeholder="Descripcion..." rows={3}
                className="w-full px-3 py-2 text-[13px] rounded-xl border border-slate-200 outline-none focus:border-teal-400 resize-none transition-all"
                style={{ fontFamily: "'Poppins', sans-serif" }} />
            </div>
            <div className="px-4 pb-8">
              <button onClick={handleSaveIncident} disabled={savingIncident}
                className="w-full py-3 rounded-xl text-white font-black text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-all"
                style={{ background: TEAL }}>
                {savingIncident ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Guardar Incidente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewInventory && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => setShowNewInventory(false)}>
          <div className="w-full max-w-sm bg-white rounded-t-2xl shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="font-black text-slate-800">Nuevo Registro de Inventario</span>
              <button onClick={() => setShowNewInventory(false)} className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-3.5 h-3.5 text-slate-500" /></button>
            </div>
            <div className="px-4 py-3 space-y-3">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-1">Foto del almacen</p>
                {newInvPhoto ? (
                  <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 mb-2">
                    <img src={newInvPhoto} alt="foto" className="w-full h-full object-cover" />
                    <button onClick={() => setNewInvPhoto(null)} className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><X className="w-3 h-3 text-white" /></button>
                  </div>
                ) : (
                  <>
                    <input ref={invPhotoRef} type="file" accept="image/*" className="hidden" onChange={handleInvPhoto} />
                    <button onClick={() => invPhotoRef.current?.click()} className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 flex items-center justify-center gap-1.5 text-[12px] font-semibold text-slate-400">
                      <Camera className="w-3.5 h-3.5" /> Agregar foto
                    </button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {(['Low', 'Out of Stock'] as const).map(s => (
                  <button key={s} onClick={() => setNewInvStatus(s)}
                    className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${newInvStatus === s ? s === 'Out of Stock' ? 'bg-red-50 border-red-300 text-red-500' : 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                    {s}
                  </button>
                ))}
              </div>
              <textarea value={newInvComment} onChange={e => setNewInvComment(e.target.value)} placeholder="Que esta faltando o bajo en stock?" rows={3}
                className="w-full px-3 py-2 text-[13px] rounded-xl border border-slate-200 outline-none focus:border-teal-400 resize-none transition-all"
                style={{ fontFamily: "'Poppins', sans-serif" }} />
            </div>
            <div className="px-4 pb-8">
              <button onClick={handleSaveInventory} disabled={savingInventory}
                className="w-full py-3 rounded-xl text-white font-black text-[13px] flex items-center justify-center gap-2 active:scale-95 transition-all"
                style={{ background: TEAL }}>
                {savingInventory ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
