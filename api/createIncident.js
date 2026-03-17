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
    const { name, comment, propertyId, cleaningId } = body;
    if (!name) return res.status(400).json({ error: 'name requerido' });

    console.log('[createIncident]', { name, comment, propertyId, cleaningId });

    const fields = {
      'Name': name,
      'Comment': comment || '',
      'Status': 'Reported',
    };
    if (propertyId) fields['Property'] = [propertyId];
    if (cleaningId) fields['Cleaning ID'] = [cleaningId];

    const airtableRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/Incidents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      console.error('[createIncident] Airtable error:', err);
      return res.status(500).json({ error: 'Error Airtable', detail: err });
    }

    const data = await airtableRes.json();
    return res.status(200).json({
      id: data.id,
      name: data.fields?.Name || name,
      status: 'Reported',
      comment: comment || '',
      photoUrls: [],
    });
  } catch (err) {
    console.error('[createIncident] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
