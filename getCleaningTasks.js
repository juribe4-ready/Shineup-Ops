// netlify/functions/getCleaningTasks.js
const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

const getRecord = async (table, id) => {
  const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}/${id}`, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
  });
  if (!res.ok) return null;
  return res.json();
};

const findAll = async (table, formula) => {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${table}?filterByFormula=${encodeURIComponent(formula)}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return data.records || [];
};

export default async (req) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers });

  try {
    const url = new URL(req.url);
    const cleaningId = url.searchParams.get('cleaningId');
    if (!cleaningId) return new Response(JSON.stringify({ error: 'cleaningId requerido' }), { status: 400, headers });

    console.log(`[getCleaningTasks] cleaningId: ${cleaningId}`);

    // 1. Obtener el registro de limpieza
    const cleaning = await getRecord('tblabOdNknnjrYUU1', cleaningId);
    if (!cleaning) return new Response(JSON.stringify({ error: 'Cleaning not found' }), { status: 404, headers });

    const f = cleaning.fields;

    // IDs relacionados
    const staffIds = f['Assigned Staff'] || [];
    const equipmentIds = f['Equipment'] || [];
    const propertyIds = f['Property'] || [];
    const cleaningTypeIds = f['Cleaning Type'] || [];
    const propertyId = propertyIds[0] || null;
    const cleaningTypeId = cleaningTypeIds[0] || null;

    // 2. Todas las llamadas en paralelo
    const [staffRecords, equipRecords, propRecord, taskRecords] = await Promise.all([
      Promise.all(staffIds.map(id => getRecord('tblgHwN1wX6u3ZtNY', id).catch(() => null))),
      Promise.all(equipmentIds.map(id => getRecord('tblFOJpGUKpCC5hQO', id).catch(() => null))),
      propertyId ? getRecord('tbl1iETmcFP460oWN', propertyId).catch(() => null) : Promise.resolve(null),
      cleaningTypeId
        ? findAll('tblChecklist', `{Cleaning Type} = "${cleaningTypeId}"`).catch(() => [])
        : Promise.resolve([]),
    ]);

    // Staff names
    const assignedStaffNames = staffRecords
      .filter(Boolean)
      .map(s => s.fields?.Name || s.fields?.name || '');

    // Equipment
    const equipment = equipRecords.filter(Boolean).map(rec => {
      const ef = rec.fields || {};
      return {
        text: ef['EquipmentText'] || ef['Equipment Text'] || ef['Name'] || 'Sin nombre',
        code: ef['EquipmentID'] || ef['Equipment ID'] || ef['EquipmentIDText'] || ef['Make'] || 'N/A',
      };
    });

    // Property data
    const pf = propRecord?.fields || {};
    const bookUrl = pf['Book URL'] || pf['BookURL'] || '';
    const initialComments = pf['InitialComments'] || pf['Initial Comments'] || '';
    const closingMediaType = pf['Video/Photo'] || pf['VideoPhoto'] || '';
    const doorCodes = pf['DoorCodes'] || pf['Door Codes'] || '';
    const labor = Number(pf['Labor'] || 0);

    // Rating resolucion
    const resolveRating = (r) => {
      if (!r) return undefined;
      if (typeof r === 'number') return r;
      const s = String(r).toLowerCase();
      if (s.includes('bueno')) return 3;
      if (s.includes('normal')) return 2;
      if (s.includes('malo')) return 1;
      return undefined;
    };
    const rating = resolveRating(f['Rating']);

    // Estimated end time
    let estimatedEndTime;
    if (labor > 0 && f['Scheduled Time']) {
      const cleanerCount = staffRecords.filter(s => {
        const role = s?.fields?.Role || '';
        return role.toLowerCase().includes('cleaner');
      }).length;
      const effectiveCleaners = Math.max(cleanerCount, 1);
      const minutesRaw = labor / effectiveCleaners;
      const minutesRounded = Math.ceil(minutesRaw / 15) * 15;
      const ratingAdj = rating === 1 ? 30 : rating === 3 ? -30 : 0;
      const totalMinutes = Math.max(minutesRounded + ratingAdj, 45);
      estimatedEndTime = new Date(new Date(f['Scheduled Time']).getTime() + totalMinutes * 60000).toISOString();
    }

    // Address
    const addressRaw = f['Address'];
    const address = Array.isArray(addressRaw) ? addressRaw[0] : (addressRaw || '');

    // Google Maps URL
    const mapsRaw = f['Google Maps URL'];
    const googleMapsUrl = Array.isArray(mapsRaw) ? mapsRaw[0] : (mapsRaw || '');

    // VideoInicial
    const videoInicialRaw = f['VideoInicial'] || f['Video Inicial'] || [];
    const videoInicial = Array.isArray(videoInicialRaw)
      ? videoInicialRaw.map(v => v?.thumbnails?.large?.url || v?.url || '').filter(Boolean)
      : [];

    // Closing photos
    const photosVideosRaw = f['PhotosVideos'] || f['Photos Videos'] || f['Closing Photos'] || [];
    const photosVideos = Array.isArray(photosVideosRaw)
      ? photosVideosRaw.filter(p => p?.url).map(p => ({ url: p.url, filename: p.filename || 'archivo' }))
      : [];

    // Tasks
    const tasks = taskRecords.map(t => ({
      id: t.id,
      taskName: t.fields?.['Task Name'] || t.fields?.taskName || '',
      taskGroup: t.fields?.['Task Group'] || t.fields?.taskGroup || 'General',
      order: t.fields?.['Order'] || t.fields?.order || 0,
    })).sort((a, b) => (a.order || 0) - (b.order || 0));

    const result = {
      cleaning: {
        id: cleaning.id,
        cleaningId: f['Cleaning ID'] || '',
        propertyText: f['Property Text'] || '',
        propertyId: propertyId || '',
        closingMediaType,
        bookUrl,
        cleaningTypeText: f['Cleaning Type Text'] || '',
        status: f['Status'] || 'Programmed',
        address,
        googleMapsUrl,
        date: f['Date'] || null,
        scheduledTime: f['Scheduled Time'] || null,
        startTime: f['Start Time'] || null,
        endTime: f['End Time'] || null,
        assignedStaffNames,
        initialComments,
        doorCodes,
        estimatedEndTime,
        openComments: f['OpenComments'] || f['Open Comments'] || '',
        rating,
        videoInicial,
        photosVideos,
        equipment,
      },
      tasks,
    };

    console.log(`[getCleaningTasks] OK - staff:${assignedStaffNames.length} tasks:${tasks.length} equipment:${equipment.length}`);

    return new Response(JSON.stringify(result), { status: 200, headers });

  } catch (err) {
    console.error('[getCleaningTasks] Error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};

export const config = { path: '/.netlify/functions/getCleaningTasks' };
