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

    // Paginacion - traer TODOS los registros superando el limite de 100
    let allRecords = [];
    let offset = null;

    do {
      const pageUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1?pageSize=100&sort[0][field]=Scheduled%20Time&sort[0][direction]=asc${offset ? `&offset=${offset}` : ''}`;

      const airtableRes = await fetch(pageUrl, {
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

      const pageData = await airtableRes.json();
      allRecords = allRecords.concat(pageData.records || []);
      offset = pageData.offset || null;

      console.log(`[getCleanings] Pagina cargada: ${pageData.records?.length} | Total hasta ahora: ${allRecords.length} | offset: ${offset ? 'hay mas' : 'fin'}`);

      // Si ya encontramos registros de hoy y ya pasamos la fecha, parar
      const hasToday = allRecords.some(r => r.fields['Date'] && r.fields['Date'].startsWith(effectiveDate));
      const hasFuture = allRecords.some(r => r.fields['Date'] && r.fields['Date'] > effectiveDate);
      if (hasToday && hasFuture) {
        console.log(`[getCleanings] Encontramos registros de hoy y futuros - parando paginacion`);
        offset = null;
      }

    } while (offset);

    console.log(`[getCleanings] Total records traidos: ${allRecords.length}`);

    // Filtrar por fecha Y staff en JavaScript
    const filtered = allRecords.filter(r => {
      const f = r.fields;
      const d = f['Date'];
      const staff = f['Assigned Staff'] || [];
      const matchDate = d && d.startsWith(effectiveDate);
      const matchStaff = Array.isArray(staff) && staff.includes(staffId);
      console.log(`[FILTER] ${r.id} date:${d} matchDate:${matchDate} staff:${JSON.stringify(staff)} matchStaff:${matchStaff}`);
      return matchDate && matchStaff;
    });

    console.log(`[getCleanings] Records para hoy con este staff: ${filtered.length}`);

    const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

    const cleanings = filtered.map(record => {
      const f = record.fields;

      const frontView = f['FrontView'] || [];
      const attachments = Array.isArray(frontView)
        ? frontView.filter(a => a?.url).map(a => ({
            url: a?.thumbnails?.large?.url || a.url
          }))
        : [];

      const addressRaw = f['Address'];
      const address = Array.isArray(addressRaw)
        ? addressRaw[0]
        : (addressRaw || 'Direccion no disponible');

      const staffListRaw = f['staffList'] || '';
      const staffList = typeof staffListRaw === 'string'
        ? staffListRaw.split(',').map(s => s.trim()).filter(Boolean)
        : [];

      const equipment = f['Equipment'] || [];
      const equipmentCount = Array.isArray(equipment) ? equipment.length : 0;

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
