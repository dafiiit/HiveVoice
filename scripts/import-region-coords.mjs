// Gives German municipalities a centre point for the map. Data: Wikidata
// (CC0), coordinate (P625) by the official municipality key (AGS, P439).
// Districts, states and the country get the mean of their municipalities,
// city districts the point of their city. Safe to run again.
//
//   node --env-file=.env.local scripts/import-region-coords.mjs
//
// On Supabase it writes through private.exec (MIGRATION_DATABASE_URL); with
// MIGRATION_MODE=direct it writes with the given superuser URL.
import postgres from 'postgres';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is not set');
const direct = process.env.MIGRATION_MODE === 'direct';
const sql = postgres(url, { max: 1, ssl: /localhost|sslmode=disable/.test(url) ? false : 'require', onnotice: () => {} });

async function run(text) {
  if (direct) await sql.unsafe(text);
  else await sql`select private.exec(${text})`;
}

console.log('Wikidata …');
const query = 'SELECT ?ags ?coord WHERE { ?item wdt:P439 ?ags; wdt:P625 ?coord. }';
const res = await fetch(`https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}`, {
  headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'HiveVoice region import (https://github.com/dafiiit/HiveVoice)' },
});
if (!res.ok) throw new Error(`Wikidata: HTTP ${res.status}`);
const seen = new Set();
const rows = [];
for (const b of (await res.json()).results.bindings) {
  const code = b.ags.value;
  const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(b.coord.value);
  if (!/^\d{8}$/.test(code) || !m || seen.has(code)) continue;
  seen.add(code);
  rows.push({ code, lon: Number(Number(m[1]).toFixed(5)), lat: Number(Number(m[2]).toFixed(5)) });
}
console.log(`${rows.length} Gemeinden mit Koordinaten`);

for (let i = 0; i < rows.length; i += 2000) {
  const json = JSON.stringify(rows.slice(i, i + 2000));
  await run(`
    update public.regions g set lat = r.lat, lon = r.lon
    from jsonb_to_recordset($hv$${json}$hv$::jsonb) as r(code text, lat float8, lon float8)
    where g.level = 'municipality' and g.country_code = 'DE' and g.official_code = r.code`);
}

// Upwards: districts, states, country as the mean of the level below; city districts take their city's point.
for (const level of ['district', 'state', 'country']) {
  await run(`
    update public.regions p set lat = c.lat, lon = c.lon
    from (select parent_id, avg(lat) lat, avg(lon) lon from public.regions where lat is not null group by parent_id) c
    where c.parent_id = p.id and p.level = '${level}'`);
}
await run(`
  update public.regions b set lat = p.lat, lon = p.lon from public.regions p
  where b.parent_id = p.id and b.level = 'borough' and b.lat is null and p.lat is not null`);

console.log('fertig');
await sql.end();
