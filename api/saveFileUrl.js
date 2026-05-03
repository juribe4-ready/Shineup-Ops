// api/saveFileUrl.js
// Guarda SOLO la URL como texto en Airtable - NO duplica storage

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

    // Obtener registro actual
    const getRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1/${cleaningId}`,
      { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } }
    );

    if (!getRes.ok) throw new Error('Error obteniendo registro de Airtable');
    const record = await getRes.json();

    const fields = {};

    // Guardar URL como TEXTO (múltiples URLs separadas por newline)
    if (type === 'video') {
      const existing = record.fields['VideoInicialURLs'] || '';
      fields['VideoInicialURLs'] = existing ? `${existing}\n${publicUrl}` : publicUrl;
    } else if (type === 'storage') {
      fields['StoragePhotoURL'] = publicUrl;
    } else if (type === 'closing') {
      const existing = record.fields['ClosingMediaURLs'] || '';
      fields['ClosingMediaURLs'] = existing ? `${existing}\n${publicUrl}` : publicUrl;
    }

    // Si es video inicial, cambiar status a Opened
    if (type === 'video' && record.fields['Status'] === 'Programmed') {
      fields['Status'] = 'Opened';
      console.log(`[saveFileUrl] Cambiando status a Opened`);
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
      console.error(`[saveFileUrl] Error Airtable:`, err);
      return res.status(500).json({ error: 'Error guardando en Airtable', detail: err });
    }

    console.log(`[saveFileUrl] Guardado URL como texto en Airtable OK`);
    return res.status(200).json({ success: true, url: publicUrl });

  } catch (err) {
    console.error('[saveFileUrl] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
