// api/uploadFile.js - Supabase Storage
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://jpdajjiaukzilrxwcgtx.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { cleaningId, propertyName, type, filename, contentType, fileBase64 } = body

    if (!filename || !fileBase64) {
      return res.status(400).json({ error: 'filename y fileBase64 requeridos' })
    }

    // Decode base64
    const buffer = Buffer.from(fileBase64, 'base64')
    
    // Generate unique path with property name for easy filtering
    const now = new Date()
    const timestamp = now.toISOString().slice(0, 19).replace(/:/g, '-').replace('T', '_')
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    const safeProperty = (propertyName || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30)
    const folder = type || 'uploads'
    
    // Format: type/YYYY-MM-DD_HH-MM-SS_PropertyName_CleaningId_Filename
    const path = `${folder}/${timestamp}_${safeProperty}_${cleaningId || 'general'}_${safeName}`

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from('shineup-media')
      .upload(path, buffer, {
        contentType: contentType || 'application/octet-stream',
        upsert: false
      })

    if (error) throw error

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('shineup-media')
      .getPublicUrl(path)

    const publicUrl = urlData.publicUrl

    console.log(`[uploadFile] Supabase uploaded: ${path}`)

    return res.status(200).json({ publicUrl, path })

  } catch (err) {
    console.error('[uploadFile] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
