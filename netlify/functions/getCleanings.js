// netlify/functions/getCleanings.js
// Reemplaza el endpoint getCleanings.ts de Zite
// Llama directo al API de Airtable - sin intermediarios

const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN; // Lo configuras en Netlify dashboard

export default async (req) => {
  // CORS headers para que el frontend pueda llamar esta funcion
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
    const date = url.searchParams.get('date');
    const staffId = url.searchParams.get('staffId');

    if (!staffId) {
      return new Response(JSON.stringify({ error: 'staffId requerido' }), { status: 400, headers });
    }

    // Fecha efectiva - Columbus OH (UTC-5)
    const now = new Date();
    const columbusTime = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    const effectiveDate = date || columbusTime.toISOString().split('T')[0];

    console.log(`[getCleanings] staffId: ${staffId} | date: ${effectiveDate}`);

    // Llamada directa a Airtable REST API
    // Filtra por staff asignado y fecha de hoy
    const filterFormula = encodeURIComponent(
      `AND(
        FIND("${staffId}", ARRAYJOIN({Assigned Staff}, ",")),
        IS_SAME({Date}, "${effectiveDate}", "day")
      )`
    );

    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1?filterByFormula=${filterFormula}&sort[0][field]=Scheduled Time&sort[0][direction]=asc`;

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

    // Mapeo igual al que tenia en Zite
    const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

    const cleanings = records.map(record => {
      const f = record.fields;

      // Foto de portada
      const frontView = f['FrontView'] || f['Front View'] || [];
      const attachments = Array.isArray(frontView)
        ? frontView.filter(a => a?.url).map(a => ({
            url: a?.thumbnails?.large?.url || a.url
          }))
        : [];

      // Staff initials - los IDs vienen como array de record IDs
      const assignedStaff = f['Assigned Staff'] || [];

      // Equipment count
      const equipment = f['Equipment'] || [];
      const equipmentCount = Array.isArray(equipment) ? equipment.length : 0;

      // Fecha formateada
      const rawDate = f['Date'];
      let formattedDate = '--';
      if (rawDate) {
        const [, month, day] = rawDate.split('T')[0].split('-');
        formattedDate = `${parseInt(day)} ${MONTHS[parseInt(month) - 1]}`;
      }

      return {
        id: record.id,
        propertyText: f['Property Text'] || f['PropertyText'] || 'Propiedad sin nombre',
        address: f['Address'] || f['address'] || 'Direccion no disponible',
        status: f['Status'] || 'Programmed',
        date: rawDate || null,
        formattedDate,
        scheduledTime: f['Scheduled Time'] || null,
        notes: f['Notes'] || f['OpenComments'] || '',
        staffIds: assignedStaff,      // IDs crudos - los resolveremos despues
        equipmentCount,
        attachments,
      };
    });

    // Ordenar: Done al final
    cleanings.sort((a, b) => {
      if (a.status === 'Done' && b.status !== 'Done') return 1;
      if (a.status !== 'Done' && b.status === 'Done') return -1;
      return 0;
    });

    return new Response(JSON.stringify(cleanings), { status: 200, headers });

  } catch (err) {
    console.error('[getCleanings] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: '/.netlify/functions/getCleanings' };
