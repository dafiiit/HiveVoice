// Imports German regions (Bund, Länder, Kreise, Gemeinden), postal codes and
// the Munich city districts. Data: OpenPLZ API (https://www.openplzapi.org),
// based on official sources (Destatis, Deutsche Post). Safe to run again.
//
//   node --env-file=.env.local scripts/import-regions.mjs
//
// On Supabase it writes through private.exec (MIGRATION_DATABASE_URL); with
// MIGRATION_MODE=direct it writes with the given superuser URL.
import postgres from 'postgres';

const API = 'https://openplzapi.org/de';
const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is not set');
const direct = process.env.MIGRATION_MODE === 'direct';
const sql = postgres(url, { max: 1, ssl: /localhost|sslmode=disable/.test(url) ? false : 'require', onnotice: () => {} });

async function getAll(path) {
  const out = [];
  for (let page = 1; ; page++) {
    let res;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}page=${page}&pageSize=50`);
      if (res.ok) break;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    out.push(...(await res.json()));
    const total = Number(res.headers.get('x-total-pages') ?? 1);
    if (page >= total) return out;
  }
}

async function run(text) {
  if (direct) await sql.unsafe(text);
  else await sql`select private.exec(${text})`;
}

// Upserts rows given as JSON; parent is resolved by (level, official_code).
async function upsertRegions(rows) {
  for (let i = 0; i < rows.length; i += 2000) {
    const json = JSON.stringify(rows.slice(i, i + 2000));
    if (json.includes('$hv$')) throw new Error('unexpected delimiter in data');
    await run(`
      insert into public.regions (level, name, official_code, parent_id, country_code)
      select r.level::public.region_level, r.name, r.code, p.id, 'DE'
      from jsonb_to_recordset($hv$${json}$hv$::jsonb) as r(level text, name text, code text, parent_level text, parent_code text)
      left join public.regions p on p.level::text = r.parent_level and p.official_code = r.parent_code and p.country_code = 'DE'
      on conflict (country_code, level, official_code) do update set name = excluded.name, parent_id = excluded.parent_id`);
  }
}

const tidy = (name) => name.replace(/, Landeshauptstadt$|, Stadt$|, Hansestadt$|, Wissenschaftsstadt$/, '');

console.log('Länder …');
const states = await (await fetch(`${API}/FederalStates`)).json();
await upsertRegions([{ level: 'country', name: 'Deutschland', code: 'DE' }]);
await upsertRegions(states.map((s) => ({ level: 'state', name: s.name, code: s.key, parent_level: 'country', parent_code: 'DE' })));

const only = process.env.ONLY_STATES?.split(',');
for (const s of states.filter((x) => !only || only.includes(x.key))) {
  const districts = await getAll(`/FederalStates/${s.key}/Districts`);
  await upsertRegions(districts.map((d) => ({
    level: 'district', name: tidy(d.name), code: d.key, parent_level: 'state', parent_code: s.key })));
  let municipalities = await getAll(`/FederalStates/${s.key}/Municipalities`);
  // City states (Berlin, Hamburg) have no municipality level in the source.
  if (!municipalities.length) municipalities = districts.map((d) => ({ key: `${d.key}000`, name: d.name, district: d }));
  await upsertRegions(municipalities.map((m) => ({
    level: 'municipality', name: tidy(m.name), code: m.key, parent_level: 'district', parent_code: m.district.key })));
  const localities = await getAll(`/FederalStates/${s.key}/Localities`);
  const plz = localities.filter((l) => l.municipality?.key).map((l) => ({ code: l.postalCode, locality: l.name, muni: l.municipality.key }));
  for (let i = 0; i < plz.length; i += 3000) {
    const json = JSON.stringify(plz.slice(i, i + 3000));
    await run(`
      insert into public.postal_codes (code, region_id, locality)
      select x.code, r.id, x.locality from jsonb_to_recordset($hv$${json}$hv$::jsonb) as x(code text, locality text, muni text)
      join public.regions r on r.level = 'municipality' and r.official_code = x.muni and r.country_code = 'DE'
      on conflict (code, region_id) do update set locality = excluded.locality`);
  }
  console.log(`${s.name}: ${districts.length} Kreise, ${municipalities.length} Gemeinden, ${plz.length} PLZ-Orte`);
}

// Munich city districts (Stadtbezirke), official numbering.
const munich = ['Altstadt-Lehel', 'Ludwigsvorstadt-Isarvorstadt', 'Maxvorstadt', 'Schwabing-West', 'Au-Haidhausen',
  'Sendling', 'Sendling-Westpark', 'Schwanthalerhöhe', 'Neuhausen-Nymphenburg', 'Moosach', 'Milbertshofen-Am Hart',
  'Schwabing-Freimann', 'Bogenhausen', 'Berg am Laim', 'Trudering-Riem', 'Ramersdorf-Perlach',
  'Obergiesing-Fasangarten', 'Untergiesing-Harlaching', 'Thalkirchen-Obersendling-Forstenried-Fürstenried-Solln',
  'Hadern', 'Pasing-Obermenzing', 'Aubing-Lochhausen-Langwied', 'Allach-Untermenzing', 'Feldmoching-Hasenbergl', 'Laim'];
await upsertRegions(munich.map((name, i) => ({
  level: 'borough', name, code: `09162000-${String(i + 1).padStart(2, '0')}`, parent_level: 'municipality', parent_code: '09162000' })));

await sql.end();
console.log('Fertig.');
