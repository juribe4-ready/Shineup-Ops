// Turnos (una fila por persona y dia) en la tabla "Turnos" de Airtable.
//   GET  /api/shifts?date=YYYY-MM-DD                      -> turnos de ese dia
//   POST /api/shifts {action:'start',  date, people:[{staffId,name,initials,start}], registeredBy}
//   POST /api/shifts {action:'update', id, start?, end?}  -> corrige horas de una fila
//   POST /api/shifts {action:'close',  rows:[{id,start,end,notes?}], by}  -> fija horas y marca Cerrado
//   POST /api/shifts {action:'reopen', ids:[...]}          -> quita Cerrado y Fin (por si se cerro por error)
// Campos de Airtable: Turno, Fecha, Persona (link a Staff), Inicio, Fin, "Registrado por", Cerrado, Notas
const AIRTABLE_BASE = 'appBwnoxgyIXILe6M';
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const TABLE = 'Turnos';
const URL_BASE = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${encodeURIComponent(TABLE)}`;
const H = { 'Authorization': `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' };
const isDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
// Bitacora en el campo existente "Notas": "Cerrado por X · fecha hora" / "Reabierto por Y · ..." (se conserva lo anterior, max ~800 chars)
const stamp = () => new Date().toLocaleString('en-US', { timeZone: 'America/New_York', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const appendLog = (prev, line) => (String(prev || '') ? String(prev) + '\n' : '') + line;
const clip = (t) => String(t).slice(-800);
const cleanBy = (b) => String(b || 'alguien').replace(/[\r\n]/g, ' ').slice(0, 60);
const isIso = (t) => typeof t === 'string' && !isNaN(new Date(t).getTime());

const shape = (r) => ({
  id: r.id,
  staffId: Array.isArray(r.fields['Persona']) ? r.fields['Persona'][0] : null,
  date: r.fields['Fecha'] || null,
  start: r.fields['Inicio'] || null,
  end: r.fields['Fin'] || null,
  closed: !!r.fields['Cerrado'],
  registeredBy: r.fields['Registrado por'] || '',
  label: r.fields['Turno'] || '',
  notes: r.fields['Notas'] || '',
});

async function listDay(date) {
  let records = [], offset = null;
  const formula = encodeURIComponent(`IS_SAME({Fecha},'${date}','day')`);
  do {
    const r = await fetch(`${URL_BASE}?pageSize=100&filterByFormula=${formula}${offset ? `&offset=${offset}` : ''}`, { headers: H });
    if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const d = await r.json();
    records = records.concat(d.records || []);
    offset = d.offset || null;
  } while (offset);
  return records.filter(r => String(r.fields['Fecha'] || '').startsWith(date)).map(shape);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    if (req.method === 'GET') {
      const { date } = req.query;
      if (!isDate(date)) return res.status(400).json({ error: 'date invalida' });
      return res.status(200).json({ shifts: await listDay(date) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo no permitido' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const { action } = body;

    if (action === 'start') {
      const { date, people, registeredBy } = body;
      if (!isDate(date) || !Array.isArray(people) || !people.length) return res.status(400).json({ error: 'datos invalidos' });
      const existing = await listDay(date);
      const have = new Set(existing.map(s => s.staffId));
      const toCreate = people.filter(p => p && /^rec[A-Za-z0-9]{14}$/.test(p.staffId || '') && !have.has(p.staffId) && isIso(p.start));
      for (let i = 0; i < toCreate.length; i += 10) {
        const chunk = toCreate.slice(i, i + 10).map(p => ({ fields: {
          'Turno': `${p.initials || p.name || ''} ${date}`.trim(),
          'Fecha': date, 'Persona': [p.staffId], 'Inicio': new Date(p.start).toISOString(),
          'Registrado por': String(registeredBy || '').slice(0, 80), 'Cerrado': false } }));
        const r = await fetch(URL_BASE, { method: 'POST', headers: H, body: JSON.stringify({ records: chunk }) });
        if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 300)}`);
      }
      return res.status(200).json({ shifts: await listDay(date) });
    }

    if (action === 'update') {
      const { id, start, end } = body;
      if (!/^rec[A-Za-z0-9]{14}$/.test(id || '')) return res.status(400).json({ error: 'id invalido' });
      const fields = {};
      if (start !== undefined) { if (!isIso(start)) return res.status(400).json({ error: 'inicio invalido' }); fields['Inicio'] = new Date(start).toISOString(); }
      if (end !== undefined) { if (!isIso(end)) return res.status(400).json({ error: 'fin invalido' }); fields['Fin'] = new Date(end).toISOString(); }
      const r = await fetch(`${URL_BASE}/${id}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
      if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return res.status(200).json({ ok: true });
    }

    if (action === 'close') {
      const { rows, by } = body;
      if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'datos invalidos' });
      const valid = rows.filter(x => /^rec[A-Za-z0-9]{14}$/.test(x?.id || '') && isIso(x.start) && isIso(x.end));
      if (valid.length !== rows.length) return res.status(400).json({ error: 'horas invalidas' });
      for (const x of valid) if (new Date(x.end) < new Date(x.start)) return res.status(400).json({ error: 'El fin es antes del inicio' });
      for (let i = 0; i < valid.length; i += 10) {
        const chunk = valid.slice(i, i + 10).map(x => ({ id: x.id, fields: { 'Inicio': new Date(x.start).toISOString(), 'Fin': new Date(x.end).toISOString(), 'Cerrado': true, 'Notas': clip(appendLog(x.notes, `Cerrado por ${cleanBy(by)} · ${stamp()}`)) } }));
        const r = await fetch(URL_BASE, { method: 'PATCH', headers: H, body: JSON.stringify({ records: chunk }) });
        if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 300)}`);
      }
      return res.status(200).json({ ok: true });
    }
    if (action === 'reopen') {
      const { ids, by, notes } = body;
      if (!Array.isArray(ids) || !ids.length || !ids.every(i => /^rec[A-Za-z0-9]{14}$/.test(i || ''))) return res.status(400).json({ error: 'ids invalidos' });
      const prevNotes = (notes && typeof notes === 'object') ? notes : {};
      for (let i = 0; i < ids.length; i += 10) {
        const chunk = ids.slice(i, i + 10).map(id => ({ id, fields: { 'Cerrado': false, 'Fin': null, 'Notas': clip(appendLog(prevNotes[id], `Reabierto por ${cleanBy(by)} · ${stamp()}`)) } }));
        const r = await fetch(URL_BASE, { method: 'PATCH', headers: H, body: JSON.stringify({ records: chunk }) });
        if (!r.ok) throw new Error(`Airtable ${r.status}: ${(await r.text()).slice(0, 300)}`);
      }
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'accion desconocida' });
  } catch (err) {
    console.error('[shifts] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
