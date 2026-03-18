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
    const { cleaningId, type, filename, base64, contentType } = body;

    if (!cleaningId || !base64) {
      return res.status(400).json({ error: 'cleaningId y base64 requeridos' });
    }

    console.log(`[uploadFile] cleaningId: ${cleaningId} | type: ${type} | filename: ${filename}`);

    // Paso 1: Obtener el registro actual para acumular attachments
    const getRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1/${cleaningId}`, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
    });

    if (!getRes.ok) {
      const err = await getRes.text();
      return res.status(500).json({ error: 'Error obteniendo registro', detail: err });
    }

    const record = await getRes.json();
    const fieldName = type === 'video' ? 'VideoInicial' : 'PhotosVideos';
    const existing = record.fields[fieldName] || [];

    // Paso 2: Subir el nuevo archivo usando el endpoint de attachments de Airtable
    const uploadRes = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1/${cleaningId}/uploadAttachment/${fieldName}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contentType: contentType || 'image/jpeg',
          filename: filename || 'archivo.jpg',
          file: base64,
        }),
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('[uploadFile] Upload error:', err);

      // Fallback: si el endpoint de upload no funciona, intentar con URL publica
      return res.status(500).json({ error: 'Error al subir archivo', detail: err });
    }

    const uploadData = await uploadRes.json();
    console.log('[uploadFile] Upload exitoso:', uploadData?.id);

    // Retornar la URL del archivo subido
    const newAttachment = uploadData;
    const url = newAttachment?.thumbnails?.large?.url || newAttachment?.url || '';

    // Actualizar status si es video inicial
    if (type === 'video') {
      await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1/${cleaningId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields: { 'Status': 'Opened' } }),
      });
    }

    return res.status(200).json({ success: true, url });

  } catch (err) {
    console.error('[uploadFile] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
