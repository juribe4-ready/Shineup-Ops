const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

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

    const hdrs = { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` };
    const BASE_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1?pageSize=100&sort[0][field]=Scheduled%20Time&sort[0][direction]=asc`;

    // Staff initials (se pide en paralelo con las limpiezas)
    const staffMap = {};
    const nameMap = {};
    const staffPromise = (async () => {
      try {
        // Con Name (para el pase de lista); si Airtable lo rechaza, se pide como antes (solo Initials)
        let staffRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblgHwN1wX6u3ZtNY?fields[]=Initials&fields[]=Name`, { headers: hdrs });
        if (!staffRes.ok) staffRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblgHwN1wX6u3ZtNY?fields[]=Initials`, { headers: hdrs });
        if (staffRes.ok) {
          const staffData = await staffRes.json();
          for (const s of (staffData.records || [])) {
            staffMap[s.id] = s.fields?.Initials || s.fields?.Name?.substring(0, 2).toUpperCase() || '??';
            if (s.fields?.Name) nameMap[s.id] = String(s.fields.Name);
          }
        }
      } catch {}
    })();

    // Descarga todas las paginas de una URL. Devuelve null si Airtable responde error.
    const fetchAll = async (extraQuery) => {
      let records = [];
      let offset = null;
      do {
        const pageUrl = `${BASE_URL}${extraQuery || ''}${offset ? `&offset=${offset}` : ''}`;
        const r = await fetch(pageUrl, { headers: hdrs });
        if (!r.ok) return { error: await r.text() };
        const pageData = await r.json();
        records = records.concat(pageData.records || []);
        offset = pageData.offset || null;
      } while (offset);
      return { records };
    };

    // RAPIDO: solo el dia pedido (+/- 1 dia por zonas horarias; el filtro exacto sigue abajo) y solo los campos que se usan.
    // Si Airtable rechaza la consulta o no devuelve nada, se hace la lectura completa de siempre (misma logica que antes).
    let allRecords = null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
      const shift = (n) => { const d = new Date(effectiveDate + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
      const formula = `OR(IS_SAME({Date},'${shift(-1)}','day'),IS_SAME({Date},'${effectiveDate}','day'),IS_SAME({Date},'${shift(1)}','day'))`;
      const FIELDS = ['Date', 'Assigned Staff', 'FrontView', 'Address', 'Property Text', 'Status', 'Equipment', 'Scheduled Time', 'OpenComments', 'Cleaning Type Text', 'Cleaning Type'];
      const q = `&filterByFormula=${encodeURIComponent(formula)}` + FIELDS.map(f => `&fields[]=${encodeURIComponent(f)}`).join('');
      try {
        const fast = await fetchAll(q);
        if (fast.records && fast.records.length > 0) allRecords = fast.records;
        else console.log('[getCleanings] consulta rapida sin resultado, se usa lectura completa', fast.error ? String(fast.error).slice(0, 200) : '');
      } catch (e) { console.log('[getCleanings] consulta rapida fallo', e?.message); }
    }
    if (!allRecords) {
      const full = await fetchAll('');
      if (full.error) return res.status(500).json({ error: 'Error Airtable', detail: full.error });
      allRecords = full.records;
    }
    await staffPromise;

    console.log(`[getCleanings] Total leidos: ${allRecords.length}`);

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
      const assignedStaffIds = Array.isArray(f['Assigned Staff']) ? f['Assigned Staff'] : [];
      const staffList = assignedStaffIds.map(id => staffMap[id] || '??').filter(Boolean);
      const staffNames = assignedStaffIds.map(id => nameMap[id] || staffMap[id] || '');
      const equipment = f['Equipment'] || [];
      const equipmentCount = Array.isArray(equipment) ? equipment.length : 0;
      const rawDate = f['Date'];
      let formattedDate = '--';
      if (rawDate) {
        const parts = rawDate.split('-');
        formattedDate = `${parseInt(parts[2])} ${MONTHS[parseInt(parts[1]) - 1]}`;
      }
      const ctRaw = f['Cleaning Type Text'] ?? f['Cleaning Type'];
      let cleaningType = Array.isArray(ctRaw) ? String(ctRaw[0] || '') : (typeof ctRaw === 'string' ? ctRaw : '');
      if (/^rec[A-Za-z0-9]{14}$/.test(cleaningType)) cleaningType = '';
      return {
        id: record.id,
        propertyText: f['Property Text'] || 'Propiedad sin nombre',
        address, status: f['Status'] || 'Programmed',
        date: rawDate || null, formattedDate,
        scheduledTime: f['Scheduled Time'] || null,
        notes: f['OpenComments'] || '',
        staffList, staffIds: assignedStaffIds, staffNames, equipmentCount, attachments, cleaningType,
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
