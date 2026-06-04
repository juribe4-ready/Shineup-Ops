// Consolidated reports API: /api/getReports?type=incidents|inventory
const AIRTABLE_BASE  = 'appBwnoxgyIXILe6M'
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN
const STAFF_TABLE    = 'tblgHwN1wX6u3ZtNY'
const PROPS_TABLE    = 'tbl1iETmcFP460oWN'
const INV_TABLE      = 'tblppdLDDnyT0eye9'
const CLEANINGS_TABLE= 'tblabOdNknnjrYUU1'
const APPOINTMENTS_TABLE = 'tblXlpg7MuYWA8Ocn'
const CLIENTS_TABLE      = 'Clients'

async function buildMaps(headers) {
  const staffMap = {}, propMap = {}
  try {
    const sr = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${STAFF_TABLE}?fields[]=Name&fields[]=Initials`, { headers })
    if (sr.ok) { const sd = await sr.json(); for (const s of (sd.records||[])) staffMap[s.id] = s.fields?.Name || s.fields?.Initials || '?' }
  } catch {}
  try {
    const pr = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${PROPS_TABLE}?fields[]=Name`, { headers })
    if (pr.ok) { const pd = await pr.json(); for (const p of (pd.records||[])) propMap[p.id] = p.fields?.Name || '?' }
  } catch {}
  return { staffMap, propMap }
}

async function getIncidents(headers, staffMap, propMap) {
  const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/Incidents?sort[0][field]=Creation%20Date&sort[0][direction]=desc`, { headers })
  if (!r.ok) throw new Error('Error Airtable Incidents')
  const data = await r.json()
  return (data.records||[]).map(rec => {
    const f = rec.fields
    const propId = Array.isArray(f['Property']) ? f['Property'][0] : f['Property']
    return {
      id: rec.id, name: f['Name']||'Sin nombre', status: f['Status']||'Reported',
      creationDate: f['Creation Date']||null, comment: f['Comment']||'',
      propertyId: propId||null, propertyName: propMap[propId]||'Sin propiedad',
      photoUrls: f['MediaURL'] ? [f['MediaURL']] : (Array.isArray(f['Photos']) ? f['Photos'].map(p=>p?.url).filter(Boolean) : []),
      reportedBy: Array.isArray(f['Reported By']) ? (staffMap[f['Reported By'][0]]||'') : (f['Reported By']||''),
    }
  })
}

async function getInventory(headers, staffMap, propMap) {
  // Latest StoragePhoto per property
  const storageMap = {}
  try {
    const cr = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLEANINGS_TABLE}?fields[]=Property&fields[]=StoragePhoto&fields[]=Scheduled%20Time&sort[0][field]=Scheduled%20Time&sort[0][direction]=desc`, { headers })
    if (cr.ok) {
      const cd = await cr.json()
      for (const rec of (cd.records||[])) {
        const f = rec.fields
        const propId = Array.isArray(f['Property']) ? f['Property'][0] : f['Property']
        const raw = f['StoragePhoto']||[]
        const url = Array.isArray(raw) && raw[0] ? (raw[0].thumbnails?.large?.url || raw[0].url || null) : null
        if (propId && url && !storageMap[propId]) storageMap[propId] = { url, date: (f['Scheduled Time']||'').slice(0,10) }
      }
    }
  } catch {}

  const r = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${INV_TABLE}?sort[0][field]=Date&sort[0][direction]=desc`, { headers })
  if (!r.ok) throw new Error('Error Airtable Inventory')
  const data = await r.json()
  return (data.records||[]).map(rec => {
    const f = rec.fields
    const propId = Array.isArray(f['Property']) ? f['Property'][0] : f['Property']
    const photos = f['Attachments'] || f['Photos'] || []
    return {
      id: rec.id, status: f['Status']||'Low', comment: f['Comment']||f['Item']||'',
      date: f['Date']||null, propertyId: propId||null, propertyName: propMap[propId]||'Sin propiedad',
      photoUrls: f['MediaURL'] ? [f['MediaURL']] : (Array.isArray(photos) ? photos.map(p=>p?.url).filter(Boolean) : []),
      reportedBy: Array.isArray(f['Reported By']) ? (staffMap[f['Reported By'][0]]||'') : (f['Reported By']||''),
      storagePhoto: storageMap[propId] || null,
    }
  })
}


async function getBilling(headers, query) {
  const { dateFrom, dateTo } = query
  const df = dateFrom || (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })()
  const dt = dateTo   || new Date().toISOString().split('T')[0]

  const formula = encodeURIComponent(`OR({Status}='Done',{Status}='In Progress',{Status}='Opened',{Status}='Scheduled',{Status}='Programmed')`)

  let allRecords = [], offset = null
  do {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLEANINGS_TABLE}?filterByFormula=${formula}&sort[0][field]=Date&sort[0][direction]=desc${offset ? `&offset=${offset}` : ''}`
    const r = await fetch(url, { headers })
    if (!r.ok) throw new Error(await r.text())
    const data = await r.json()
    const inRange = (data.records || []).filter(rec => {
      const d = rec.fields?.['Date']
      return d && d >= df && d <= dt
    })
    allRecords = allRecords.concat(inRange)
    offset = data.offset || null
  } while (offset)

  // Build clients map: record ID → name
  const clientsMap = {}
  try {
    let clientOffset = null
    do {
      const cr = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${CLIENTS_TABLE}${clientOffset ? `?offset=${clientOffset}` : ''}`, { headers })
      if (!cr.ok) {
        const errText = await cr.text()
        console.error('[getBilling] clients fetch failed:', cr.status, errText)
        break
      }
      const cd = await cr.json()
      console.log('[getBilling] clients fetched:', cd.records?.length, 'first record fields:', JSON.stringify(cd.records?.[0]?.fields))
      for (const c of (cd.records || [])) {
        const name = c.fields?.['Full name'] || c.fields?.['Name'] || c.fields?.['Client Name'] || Object.values(c.fields || {})[0] || null
        clientsMap[c.id] = name
      }
      clientOffset = cd.offset || null
    } while (clientOffset)
    console.log('[getBilling] clientsMap size:', Object.keys(clientsMap).length)
  } catch(e) { console.error('[getBilling] clients fetch error:', e.message) }

  // Enrich with Client Name and Source from Appointments (best-effort, won't affect cleaning list)
  const cleaningIdSet = new Set(allRecords.map(r => r.id))
  const apptMap = {}
  try {
    const apptFormula = encodeURIComponent(`NOT({Related Cleaning Job} = BLANK())`)
    let apptOffset = null
    let apptPage = 0
    do {
      apptPage++
      if (apptPage > 20) break // safety limit
      const apptUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${APPOINTMENTS_TABLE}?filterByFormula=${apptFormula}&pageSize=100${apptOffset ? `&offset=${apptOffset}` : ''}`
      const ar = await fetch(apptUrl, { headers })
      if (!ar.ok) { console.error('[getBilling] appt fetch failed:', ar.status); break }
      const ad = await ar.json()
      if (ad.error) { console.error('[getBilling] appt error:', ad.error); break }
      for (const appt of (ad.records || [])) {
        const relIds = Array.isArray(appt.fields?.['Related Cleaning Job']) ? appt.fields['Related Cleaning Job'] : []
        for (const cid of relIds) {
          if (!cleaningIdSet.has(cid)) continue
          const clientRaw = appt.fields?.['Client Name'] || null
          const clientName = Array.isArray(clientRaw) ? clientRaw[0] : (clientRaw || null)
          const source = appt.fields?.['Online Platform Source'] || appt.fields?.['Source'] || null
          apptMap[cid] = { clientName, source }
        }
      }
      apptOffset = ad.offset || null
    } while (apptOffset)
  } catch(e) { console.error('[getBilling] appt lookup error:', e.message) }

  const cleanings = allRecords.map(rec => {
    const f = rec.fields
    let hoursWorked = null
    if (f['Start Time'] && f['End Time']) {
      const start = new Date(f['Start Time']), end = new Date(f['End Time'])
      hoursWorked = Math.round(((end - start) / 3600000) * 10) / 10
    }
    const staffCount = f['#Cleaners'] || 1
    const hoursTotal = hoursWorked ? Math.round(hoursWorked * staffCount * 10) / 10 : null
    const price      = f['Price'] || null
    const status     = f['Status'] || null
    const rawPayStatus = f['Payment Status'] || null
    // Normalize to lowercase, handle both 'Unpaid' and 'unpaid' from Airtable
    const payStatus  = rawPayStatus 
      ? rawPayStatus.toLowerCase()
      : (status === 'Done' ? 'unpaid' : null)
    // Client field on the Cleaning is the source of truth — apptMap as fallback only
    const cleaningClientRaw = Array.isArray(f['Client']) && f['Client'].length > 0
      ? f['Client'][f['Client'].length - 1]
      : null
    const apptClientRaw = (() => {
      const raw = apptMap[rec.id]?.clientName || null
      if (!raw) return null
      return Array.isArray(raw) ? raw[0] : raw
    })()
    const resolveClient = (raw) => {
      if (!raw) return null
      if (/^rec[A-Za-z0-9]{8,}$/.test(raw)) return clientsMap[raw] || null
      return raw
    }
    const clientName = resolveClient(cleaningClientRaw) || resolveClient(apptClientRaw) || f['Client Name Text'] || null
    if (rec.id === 'recjiGUdQbeReKqtd' || rec.id === 'recpC9nCLTDHD5wQx') {
      console.log(`[DEBUG] ${rec.id}: Client field=${JSON.stringify(f['Client'])}, cleaningClientRaw=${cleaningClientRaw}, resolved=${resolveClient(cleaningClientRaw)}, apptClientRaw=${apptClientRaw}, final=${clientName}`)
    }
    return {
      id: rec.id, date: f['Date'] || null,
      property: f['Property Text'] || 'Sin propiedad',
      clientName,
      source: apptMap[rec.id]?.source || null,
      cleaningType: f['Cleaning Type Text'] || (Array.isArray(f['Cleaning Type']) ? null : f['Cleaning Type']) || null,
      paymentStatus: payStatus,
      status,
      rating: f['Rating'] || null,
      price, hoursWorked, hoursTotal, staffCount,
      hasPrice: !!f['Price'],
    }
  })

  const sum = arr => arr.reduce((acc, c) => acc + (c.price || 0), 0)
  const unpaid   = cleanings.filter(c => c.paymentStatus === 'unpaid')
  const invoiced = cleanings.filter(c => c.paymentStatus === 'invoiced')
  const paid     = cleanings.filter(c => c.paymentStatus === 'paid')
  const overdue  = cleanings.filter(c => c.paymentStatus === 'overdue')
  // noPrice: only count Done cleanings without price (in-progress excluded)
  const doneCleanings = cleanings.filter(c => c.status === 'Done')

  return {
    cleanings,
    summary: {
      total: cleanings.length, noPrice: doneCleanings.filter(c => !c.hasPrice).length,
      unpaidCount: unpaid.length, invoicedCount: invoiced.length,
      paidCount: paid.length, overdueCount: overdue.length,
      unpaidAmount:   Math.round(sum(unpaid)   * 100) / 100,
      invoicedAmount: Math.round(sum(invoiced) * 100) / 100,
      paidAmount:     Math.round(sum(paid)     * 100) / 100,
      overdueAmount:  Math.round(sum(overdue)  * 100) / 100,
      totalRevenue:   Math.round(sum(cleanings.filter(c => c.price)) * 100) / 100,
    }
  }
}


export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const type = req.query?.type
    if (!type) return res.status(400).json({ error: 'type requerido: incidents|inventory' })
    const headers = { Authorization: `Bearer ${AIRTABLE_TOKEN}` }
    const { staffMap, propMap } = await buildMaps(headers)

    if (type === 'incidents') return res.status(200).json(await getIncidents(headers, staffMap, propMap))
    if (type === 'inventory') return res.status(200).json(await getInventory(headers, staffMap, propMap))
    if (type === 'billing')   return res.status(200).json(await getBilling(headers, req.query))
    return res.status(400).json({ error: `Unknown type: ${type}` })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
