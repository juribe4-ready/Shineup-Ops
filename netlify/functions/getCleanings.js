// netlify/functions/getCleanings.js
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

    // Sin filtro en Airtable - traemos todo y filtramos en JS
    const airtableUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1?sort[0][field]=Scheduled%20Time&sort[0][direction]=asc`;

    console.log(`[getCleanings] Consultando Airtable...`);

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

    console.log(`[getCleanings] Records totales: ${records.length}`);

    // Filtrar por fecha Y staff en JavaScript
    const filtered = records.filter(r => {
      const f = r.fields;
      const d = f['Date'];
      const staff = f['Assigned Staff'] || [];
      const matchDate = d && d.startsWith(effectiveDate);
      const matchStaff = Array.isArray(staff) && staff.includes(staffId);
      return matchDate && matchStaff;
    });

    console.log(`[getCleanings] Records para hoy con este staff: ${filtered.length}`);

    const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

    const cleanings = filtered.map(record => {
      const f = record.fields;

      // Foto - FrontView tiene thumbnails
      const frontView = f['FrontView'] || [];
      const attachments = Array.isArray(frontView)
        ? frontView.filter(a => a?.url).map(a => ({
            url: a?.thumbnails?.large?.url || a.url
          }))
        : [];

      // Address llega como array ["4190 Broadway, Grove City..."]
      const addressRaw = f['Address'];
      const address = Array.isArray(addressRaw)
        ? addressRaw[0]
        : (addressRaw || 'Direccion no disponible');

      // staffList ya viene como texto "Juan, Damaris"
      const staffListRaw = f['staffList'] || '';
      const staffList = typeof staffListRaw === 'string'
        ? staffListRaw.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      // Equipment count
      const equipment = f['Equipment'] || [];
      const equipmentCount = Array.isArray(equipment) ? equipment.length : 0;

      // Fecha formateada
      const rawDate = f['Date'];
      let formattedDate = '--';
      if (rawDate) {
        const parts = rawDate.split('-');
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        formattedDate = `${day} ${MONTHS[month - 1]}`;
      }

      return {
        id: record.id,
        propertyText: f['Property Text'] || 'Propiedad sin nombre',
        address,
        status: f['Status'] || 'Programmed',
        date: rawDate || null,
        formattedDate,
        scheduledTime: f['Scheduled Time'] || null,
        notes: f['OpenComments'] || '',
        staffList,
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
