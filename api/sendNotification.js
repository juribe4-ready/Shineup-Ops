import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jpdajjiaukzilrxwcgtx.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const FIREBASE_PROJECT_ID = 'shineup-c574a'

// Firebase service account credentials
const SERVICE_ACCOUNT = {
  client_email: 'firebase-adminsdk-fbsvc@shineup-c574a.iam.gserviceaccount.com',
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}

async function getFirebaseAccessToken() {
  const header = { alg: 'RS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: SERVICE_ACCOUNT.client_email,
    sub: SERVICE_ACCOUNT.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  const encode = obj => btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  const toSign = `${encode(header)}.${encode(payload)}`

  // Import private key
  const keyData = SERVICE_ACCOUNT.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')

  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(toSign)
  )

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')

  const jwt = `${toSign}.${sigB64}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  return tokenData.access_token
}

export async function sendPushToAll(title, body, cleaningId, supabase) {
  try {
    const { data: tokens } = await supabase.from('push_tokens').select('token')
    if (!tokens?.length) return

    const accessToken = await getFirebaseAccessToken()

    for (const { token } of tokens) {
      await fetch(`https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data: { title, body, cleaningId: cleaningId || '' },
            android: { priority: 'high' },
            apns: { headers: { 'apns-priority': '10' } },
            webpush: {
              headers: { Urgency: 'high' },
              notification: { title, body, icon: '/icon-192.png' },
            },
          }
        })
      })
    }
    console.log(`[sendNotification] Enviadas ${tokens.length} notificaciones`)
  } catch (err) {
    console.error('[sendNotification] Error:', err.message)
  }
}
