const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { propertyId } = req.query;
    if (!propertyId) return res.status(200).json([]);

    // Traer todos y filtrar en JS - mas confiable que formulas con linked records
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/Incidents?sort[0][field]=Creation Date&sort[0][direction]=desc`;

    const airtableRes = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
    });
    if (!airtableRes.ok) return res.status(500).json({ error: 'Error Airtable' });

    const data = await airtableRes.json();
    const allRecords = data.records || [];

    console.log(`[getIncidents] Total: ${allRecords.length} | propertyId: ${propertyId}`);

    const filtered = allRecords.filter(r => {
      const f = r.fields;
      const prop = f['Property'];
      const status = f['Status'] || '';
      // Property puede ser string o array
      const propMatch = Array.isArray(prop)
        ? prop.includes(propertyId)
        : prop === propertyId;
      return propMatch && status !== 'Closed';
    });

    console.log(`[getIncidents] Filtrados: ${filtered.length}`);

    const incidents = filtered.map(r => {
      const f = r.fields;
      const photos = f['Photos'] || [];
      return {
        id: r.id,
        name: f['Name'] || 'Sin nombre',
        status: f['Status'] || 'Reported',
        creationDate: f['Creation Date'] || null,
        comment: f['Comment'] || '',
        photoUrls: Array.isArray(photos) ? photos.map((p: any) => p?.url || '').filter(Boolean) : [],
        reportedBy: f['Reported By'] || '',
      };
    });

    return res.status(200).json(incidents);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
