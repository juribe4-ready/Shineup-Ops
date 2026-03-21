import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jpdajjiaukzilrxwcgtx.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

async function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body)
    if (req.body && typeof req.body === 'string') return resolve(JSON.parse(req.body))
    let data = ''
    req.on('data', chunk => { data += chunk })
    req.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({}) } })
  })
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'No auth' })

    const token = authHeader.replace('Bearer ', '')
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' })

    const body = await parseBody(req)
    const { token: pushToken, device } = body
    if (!pushToken) return res.status(400).json({ error: 'Token requerido' })

    // Upsert token
    const { error } = await supabase.from('push_tokens').upsert(
      { user_id: user.id, token: pushToken, device: device || 'unknown' },
      { onConflict: 'token' }
    )

    if (error) throw error
    console.log(`[savePushToken] Token guardado para ${user.email}`)
    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('[savePushToken] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
