const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

console.log('TOKEN:', AIRTABLE_TOKEN ? 'existe' : 'UNDEFINED');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { date, staffId } = req.query;
    if (!staffId) return res.status(400).json({ error: 'staffId requerido' });

    const now = new Date();
    const effectiveDate = date || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    console.log(`[getCleanings] staffId: ${staffId} | date: ${effectiveDate}`);

    let allRecords = [];
    let offset = null;

    do {
      const pageUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1?pageSize=100&sort[0][field]=Scheduled%20Time&sort[0][direction]=asc${offset ? `&offset=${offset}` : ''}`;
      const airtableRes = await fetch(pageUrl, {
        headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
      });
      if (!airtableRes.ok) {
        const err = await airtableRes.text();
        return res.status(500).json({ error: 'Error Airtable', detail: err });
      }
      const pageData = await airtableRes.json();
      allRecords = allRecords.concat(pageData.records || []);
      offset = pageData.offset || null;

      const hasToday = allRecords.some(r => r.fields['Date'] && r.fields['Date'].startsWith(effectiveDate));
      const hasFuture = allRecords.some(r => r.fields['Date'] && r.fields['Date'] > effectiveDate);
      if (hasToday && hasFuture) offset = null;
    } while (offset);

    console.log(`[getCleanings] Total: ${allRecords.length}`);

    const filtered = allRecords.filter(r => {
      const f = r.fields;
      const d = f['Date'];
      const staff = f['Assigned Staff'] || [];
      return d && d.startsWith(effectiveDate) && Array.isArray(staff) && staff.includes(staffId);
    });

    console.log(`[getCleanings] Para hoy: ${filtered.length}`);

    const MONTHS = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];

    const cleanings = filtered.map(record => {
      const f = record.fields;
      const frontView = f['FrontView'] || [];
      const attachments = Array.isArray(frontView)
        ? frontView.filter(a => a?.url).map(a => ({ url: a?.thumbnails?.large?.url || a.url }))
        : [];
      const addressRaw = f['Address'];
      const address = Array.isArray(addressRaw) ? addressRaw[0] : (addressRaw || 'Direccion no disponible');
      const staffListRaw = f['staffList'] || '';
      const staffList = typeof staffListRaw === 'string'
        ? staffListRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
      const equipment = f['Equipment'] || [];
      const equipmentCount = Array.isArray(equipment) ? equipment.length : 0;
      const rawDate = f['Date'];
      let formattedDate = '--';
      if (rawDate) {
        const parts = rawDate.split('-');
        formattedDate = `${parseInt(parts[2])} ${MONTHS[parseInt(parts[1]) - 1]}`;
      }
      return {
        id: record.id,
        propertyText: f['Property Text'] || 'Propiedad sin nombre',
        address, status: f['Status'] || 'Programmed',
        date: rawDate || null, formattedDate,
        scheduledTime: f['Scheduled Time'] || null,
        notes: f['OpenComments'] || '',
        staffList, equipmentCount, attachments,
      };
    });

    cleanings.sort((a, b) => {
      if (a.status === 'Done' && b.status !== 'Done') return 1;
      if (a.status !== 'Done' && b.status === 'Done') return -1;
      return 0;
    });

    return res.status(200).json(cleanings);
  } catch (err) {
    console.error('[getCleanings] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
