// Equipo completo del dia: todos los cleaners asignados a CUALQUIER limpieza de la fecha (no solo las de quien tiene la sesion).
//   GET /api/dayTeam?date=YYYY-MM-DD -> { team: [{ staffId, name, initials }] }
// Solo lectura (mismas tablas/campos que getCleanings). Se usa para el pase de lista del Turno.
const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const hdrs = { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` };
const CLEAN_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblabOdNknnjrYUU1`;
const STAFF_URL = `https://api.airtable.com/v0/${AIRTABLE_BASE}/tblgHwN1wX6u3ZtNY`;

async function all(url) {
  let records = [], offset = null;
  do {
    const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}pageSize=100${offset ? `&offset=${offset}` : ''}`, { headers: hdrs });
    if (!r.ok) return { error: (await r.text()).slice(0, 300) };
    const d = await r.json();
    records = records.concat(d.records || []);
    offset = d.offset || null;
  } while (offset);
  return { records };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { date } = req.query;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return res.status(400).json({ error: 'date invalida' });
    const shift = (n) => { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const formula = `OR(IS_SAME({Date},'${shift(-1)}','day'),IS_SAME({Date},'${date}','day'),IS_SAME({Date},'${shift(1)}','day'))`;
    const [cl, st] = await Promise.all([
      all(`${CLEAN_URL}?filterByFormula=${encodeURIComponent(formula)}&fields[]=Date&fields[]=${encodeURIComponent('Assigned Staff')}`),
      (async () => {
        let r = await all(`${STAFF_URL}?fields[]=Initials&fields[]=Name&fields[]=Role`);
        let rolesKnown = true;
        if (r.error) { rolesKnown = false; r = await all(`${STAFF_URL}?fields[]=Initials&fields[]=Name`); }
        return { ...r, rolesKnown };
      })(),
    ]);
    if (cl.error) return res.status(500).json({ error: 'Error Airtable', detail: cl.error });
    const staff = {};
    for (const s of (st.records || [])) staff[s.id] = { name: String(s.fields?.Name || ''), initials: s.fields?.Initials || String(s.fields?.Name || '').substring(0, 2).toUpperCase() || '??', role: String(s.fields?.Role || '').toLowerCase() };
    const ids = new Set();
    for (const r of cl.records) {
      if (!String(r.fields?.Date || '').startsWith(date)) continue;
      for (const id of [].concat(r.fields?.['Assigned Staff'] || [])) if (typeof id === 'string') ids.add(id);
    }
    // Mismo criterio que getCleanings: solo cleaners (si Airtable no entrega el rol, todos)
    const team = [...ids].filter(id => !st.rolesKnown || (staff[id]?.role || '').includes('cleaner'))
      .map(id => ({ staffId: id, name: staff[id]?.name || staff[id]?.initials || 'Persona', initials: staff[id]?.initials || '??' }));
    return res.status(200).json({ team });
  } catch (err) {
    console.error('[dayTeam] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
