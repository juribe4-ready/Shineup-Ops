// api/saveFileUrl.js
// Guarda la URL del archivo en Airtable después del upload directo a B2

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const body = await parseBody(req);
    const { cleaningId, type, publicUrl, filename } = body;

    if (!cleaningId || !publicUrl) {
      return res.status(400).json({ error: 'cleaningId y publicUrl requeridos' });
    }

    console.log(`[saveFileUrl] cleaningId: ${cleaningId} | type: ${type} | url: ${publicUrl}`);

    // Primero obtener el registro actual para acumular attachments
    const getRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1/${cleaningId}`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } }
    );

    if (!getRes.ok) throw new Error('Error obteniendo registro de Airtable');
    const record = await getRes.json();

    const fieldName = type === 'video' ? 'VideoInicial' : type === 'storage' ? 'StoragePhoto' : 'Photos & Videos'
    const existing = record.fields[fieldName] || [];

    // Acumular — no reemplazar
    const newAttachments = [
      ...existing.map(a => ({ url: a.url })),
      { url: publicUrl, filename: filename || 'archivo' }
    ];

    const fields = { [fieldName]: newAttachments };

    // Si es video inicial, cambiar status a Opened
    if (type === 'video' && record.fields['Status'] === 'Programmed') {
      fields['Status'] = 'Opened';
    }

    const patchRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1/${cleaningId}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    if (!patchRes.ok) {
      const err = await patchRes.text();
      return res.status(500).json({ error: 'Error guardando en Airtable', detail: err });
    }

    console.log(`[saveFileUrl] Guardado en Airtable OK`);
    return res.status(200).json({ success: true, url: publicUrl });

  } catch (err) {
    console.error('[saveFileUrl] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
