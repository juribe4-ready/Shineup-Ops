const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { propertyId } = req.query;
    if (!propertyId) return res.status(200).json([]);

    const formula = encodeURIComponent(`AND(FIND("${propertyId}", ARRAYJOIN({Property}, ",")), {Status} != "Closed")`);
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tbli8QbMBjUuzsCPw?filterByFormula=${formula}&sort[0][field]=Creation Date&sort[0][direction]=desc`;

    const airtableRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
    });
    if (!airtableRes.ok) return res.status(500).json({ error: 'Error Airtable' });

    const data = await airtableRes.json();
    const incidents = (data.records || []).map(r => {
      const f = r.fields;
      const photos = f['Photos'] || [];
      return {
        id: r.id,
        name: f['Name'] || f['Incident Name'] || 'Sin nombre',
        status: f['Status'] || 'Reported',
        creationDate: f['Creation Date'] || f['Created'] || null,
        comment: f['Comment'] || f['Description'] || '',
        photoUrls: Array.isArray(photos) ? photos.map(p => p?.url || '').filter(Boolean) : [],
        reportedBy: f['Reported By'] || '',
      };
    });

    return res.status(200).json(incidents);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
