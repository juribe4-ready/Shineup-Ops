const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { cleaningId, status, startTime, endTime, rating, openComments } = req.body;
    if (!cleaningId) return res.status(400).json({ error: 'cleaningId requerido' });

    const fields = {};
    if (status) fields['Status'] = status;
    if (startTime) fields['Start Time'] = startTime;
    if (endTime) fields['End Time'] = endTime;
    if (rating !== undefined) {
      const ratingMap = { 1: '⭐ Malo', 2: '⭐⭐ Normal', 3: '⭐⭐⭐ Bueno' };
      fields['Rating'] = ratingMap[rating] || rating;
    }
    if (openComments !== undefined) fields['OpenComments'] = openComments;

    console.log(`[updateCleaning] ${cleaningId}`, fields);

    const airtableRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1/${cleaningId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    });

    if (!airtableRes.ok) {
      const err = await airtableRes.text();
      return res.status(500).json({ error: 'Error Airtable', detail: err });
    }

    const data = await airtableRes.json();
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error('[updateCleaning] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
