import { createClient } from '@supabase/supabase-js'
import { sendPushToAll } from './sendNotification.js'

const AIRTABLE_BASE = 'appBwnoxgyIXILe6M'
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN
const SUPABASE_URL = 'https://jpdajjiaukzilrxwcgtx.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

const STATUS_LABELS = {
  'In Progress': 'En Progreso',
  'Done': 'Terminada',
  'Opened': 'Abierta',
  'Programmed': 'Programada',
}

async function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body)
    if (req.body && typeof req.body === 'string') return resolve(JSON.parse(req.body))
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
  })
}

const RATING_MAP = {
  1: '⭐ Malo', 2: '⭐⭐ Normal', 3: '⭐⭐⭐ Bueno',
  '⭐ Malo': '⭐ Malo', '⭐⭐ Normal': '⭐⭐ Normal', '⭐⭐⭐ Bueno': '⭐⭐⭐ Bueno',
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const body = await parseBody(req)
    const { cleaningId, status, rating, startTime, endTime, openComments } = body

    if (!cleaningId) return res.status(400).json({ error: 'cleaningId requerido' })

    const fields = {}
    if (status !== undefined)       fields['Status'] = status
    if (startTime !== undefined)    fields['Start Time'] = startTime
    if (endTime !== undefined)      fields['End Time'] = endTime
    if (openComments !== undefined) fields['OpenComments'] = openComments
    if (rating !== undefined)       fields['Rating'] = RATING_MAP[rating] || null

    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1/${cleaningId}`
    const airtableRes = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields })
    })

    if (!airtableRes.ok) {
      const err = await airtableRes.text()
      return res.status(500).json({ error: err })
    }

    const updated = await airtableRes.json()
    const propertyText = updated.fields?.['Property Text'] || 'Limpieza'

    // Send push notification on status change
    if (status && SUPABASE_SERVICE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
      const label = STATUS_LABELS[status] || status
      await sendPushToAll(
        `ShineUP — ${propertyText}`,
        `Estado actualizado: ${label}`,
        cleaningId,
        supabase
      )
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[updateCleaning] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
