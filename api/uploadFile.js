// api/uploadFile.js
// Genera una URL pre-firmada de Backblaze B2 para upload directo desde el browser

const BUCKET_NAME = process.env.B2_BUCKET_NAME;
const ENDPOINT = process.env.B2_ENDPOINT;
const KEY_ID = process.env.B2_KEY_ID;
const APP_KEY = process.env.B2_APP_KEY;
const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

async function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (req.body && typeof req.body === 'string') return resolve(JSON.parse(req.body));
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { resolve({}); }
    });
  });
}

// Genera signature para S3 compatible API
function hmacSha256(key, message) {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', key).update(message).digest();
}

function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = hmacSha256('AWS4' + key, dateStamp);
  const kRegion = hmacSha256(kDate, regionName);
  const kService = hmacSha256(kRegion, serviceName);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = await parseBody(req);
    const { cleaningId, type, filename, contentType } = body;

    if (!cleaningId || !filename) {
      return res.status(400).json({ error: 'cleaningId y filename requeridos' });
    }

    console.log(`[uploadFile] cleaningId: ${cleaningId} | type: ${type} | filename: ${filename}`);

    // Generar nombre unico para el archivo
    const timestamp = Date.now();
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${type}/${cleaningId}/${timestamp}_${safeName}`;

    // Generar presigned URL usando AWS SDK compatible con B2
    const crypto = require('crypto');
    const region = ENDPOINT.split('.')[1]; // us-east-005
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDateTime = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';

    const expiresIn = 3600; // 1 hora

    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
    const credential = `${KEY_ID}/${credentialScope}`;

    const queryParams = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': credential,
      'X-Amz-Date': amzDateTime,
      'X-Amz-Expires': String(expiresIn),
      'X-Amz-SignedHeaders': 'host',
    });

    const host = `${BUCKET_NAME}.${ENDPOINT}`;
    const canonicalUri = `/${key}`;
    const canonicalQueryString = queryParams.toString();
    const canonicalHeaders = `host:${host}\n`;
    const signedHeaders = 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDateTime,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signingKey = getSignatureKey(APP_KEY, dateStamp, region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    queryParams.append('X-Amz-Signature', signature);

    const presignedUrl = `https://${host}${canonicalUri}?${queryParams.toString()}`;
    const publicUrl = `https://${host}${canonicalUri}`;

    console.log(`[uploadFile] Presigned URL generada para: ${key}`);

    // Devolver la presigned URL al frontend
    return res.status(200).json({
      presignedUrl,
      publicUrl,
      key,
      cleaningId,
      type,
    });

  } catch (err) {
    console.error('[uploadFile] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
