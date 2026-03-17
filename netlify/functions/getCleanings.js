// netlify/functions/getCleanings.js - VERSION DEBUG
const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  try {
    const url = new URL(req.url);
    const staffId = url.searchParams.get('staffId');
    const date = url.searchParams.get('date');

    console.log(`[getCleanings] staffId: ${staffId} | date: ${date}`);

    // SIN FILTRO - trae los primeros 3 registros para ver el formato crudo
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1?maxRecords=3`;

    const airtableRes = await fetch(airtableUrl, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      }
    });

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      console.error('[getCleanings] Airtable error:', err);
      return new Response(JSON.stringify({ error: 'Error Airtable', detail: err }), { status: 500, headers });
    }

    const data = await airtableRes.json();
    const records = data.records || [];

    console.log(`[getCleanings] Records encontrados: ${records.length}`);

    // LOG CRUDO - ver exactamente como llegan los datos de Airtable
    if (records[0]) {
      console.log('[DEBUG] Primer record ID:', records[0].id);
      console.log('[DEBUG] Primer record fields:', JSON.stringify(records[0].fields));
    }

    return new Response(JSON.stringify(records.map(r => ({
      id: r.id,
      fields: r.fields
    }))), { status: 200, headers });

  } catch (err) {
    console.error('[getCleanings] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: '/.netlify/functions/getCleanings' };
