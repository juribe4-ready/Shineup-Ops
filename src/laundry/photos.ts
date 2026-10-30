import { createClient } from '@supabase/supabase-js'

// Mismo bucket `media` que usa el checklist (cliente de storage aparte, anon key).
const storage = createClient(
  'https://jpdajjiaukzilrxwcgtx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpwZGFqamlhdWt6aWxyeHdjZ3R4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4ODM5ODIsImV4cCI6MjA4OTQ1OTk4Mn0.IRMW4Z4azVy6xKqGYb39tD91onTKhdnYnDTvO3ouYtE',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export async function compressImage(file: File | Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file)
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale)
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.72))
    return blob || file
  } catch { return file }
}

export async function uploadBlob(blob: Blob, tag: string): Promise<string> {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const safe = tag.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30)
  const path = `laundry/${ts}_${safe}_${Math.random().toString(36).slice(2, 7)}.jpg`
  const { error } = await storage.storage.from('media').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
  if (error) throw new Error(error.message)
  return storage.storage.from('media').getPublicUrl(path).data.publicUrl
}
