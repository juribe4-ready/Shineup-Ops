const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { name, comment, propertyId, cleaningId } = req.body;
    if (!name) return res.status(400).json({ error: 'name requerido' });

    const fields = {
      'Name': name,
      'Comment': comment || '',
      'Status': 'Reported',
    };
    if (propertyId) fields['Property'] = [propertyId];
    if (cleaningId) fields['Cleaning'] = [cleaningId];

    const airtableRes = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/tbli8QbMBjUuzsCPw`, {
      method: 'POST',
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
    return res.status(200).json({
      id: data.id,
      name: data.fields?.Name || name,
      status: 'Reported',
      comment: comment || '',
      photoUrls: [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
