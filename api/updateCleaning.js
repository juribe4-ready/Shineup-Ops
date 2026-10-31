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


// ── Cierre automático de turno: cuando una persona termina TODAS sus limpiezas asignadas del día,
// su turno (tabla Turnos) se cierra con Fin = hora real de fin de su última casa. Best-effort: nunca rompe el update.
// Se puede corregir/reabrir desde Ops (Turno) o Admin (Field).
async function autoCloseShifts(updated) {
  const H = { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' }
  const etDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const staffIds = Array.isArray(updated.fields?.['Assigned Staff']) ? updated.fields['Assigned Staff'] : []
  if (!staffIds.length) return []
  const day = String(updated.fields?.['Date'] || '').slice(0, 10) || etDay(Date.now())
  const list = async (table, formula, fields) => {
    let out = [], off = null
    do {
      const q = `pageSize=100&filterByFormula=${encodeURIComponent(formula)}${fields.map(f => `&fields%5B%5D=${encodeURIComponent(f)}`).join('')}${off ? `&offset=${off}` : ''}`
      const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}?${q}`, { headers: H })
      if (!r.ok) throw new Error(`Airtable ${r.status}`)
      const d = await r.json(); out = out.concat(d.records || []); off = d.offset || null
    } while (off)
    return out
  }
  const cleanings = await list('tblabOdNknnjrYUU1', `IS_SAME({Date},'${day}','day')`, ['Assigned Staff', 'Status', 'End Time'])
  const turnos = await list('Turnos', `IS_SAME({Fecha},'${day}','day')`, ['Persona', 'Inicio', 'Fin', 'Cerrado', 'Notas'])
  const stamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const closed = []
  for (const sid of staffIds) {
    const mine = cleanings.filter(c => (c.fields['Assigned Staff'] || []).includes(sid))
    if (!mine.length || !mine.every(c => c.fields['Status'] === 'Done')) continue
    const t = turnos.find(x => (x.fields['Persona'] || [])[0] === sid)
    if (!t || t.fields['Cerrado'] || !t.fields['Inicio']) continue
    const ends = mine.map(c => Date.parse(c.fields['End Time'] || '')).filter(n => !isNaN(n))
    let end = ends.length ? Math.max(...ends) : Date.now()
    if (end <= Date.parse(t.fields['Inicio'])) end = Date.now()
    const notes = ((t.fields['Notas'] ? t.fields['Notas'] + '\n' : '') + `Cerrado automático (última casa terminada) · ${stamp}`).slice(-800)
    const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/Turnos/${t.id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: { 'Fin': new Date(end).toISOString(), 'Cerrado': true, 'Notas': notes } }) })
    if (r.ok) closed.push(sid)
  }
  return closed
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

    // Set Payment Status to Unpaid when Done — using await to catch errors
    if (status === 'Done') {
      try {
        const psRes = await fetch(url, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { 'Payment Status': 'Unpaid' } })
        })
        if (!psRes.ok) {
          const psErr = await psRes.text()
          console.error('[updateCleaning] Payment Status failed:', psErr)
        }
      } catch(e) { console.error('[updateCleaning] Payment Status error:', e.message) }
    }

    if (status === 'Done') { try { await autoCloseShifts(updated) } catch (e) { console.error('[updateCleaning] autoClose:', e.message) } }

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
