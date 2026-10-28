// Examples for tests and the review: example people across Germany and Europe, Mia and Jonas, and for the test account
// (TEST_USER_EMAIL) a chat and a flat share with expenses, calendar and a cleaning rota (supabase/seed/test/*.sql).
// All of it is example data: Verwaltung → Beispiele entfernen (app.admin_purge_demo) takes it away again.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is not set');
const email = process.env.TEST_USER_EMAIL ?? '';
const sql = postgres(url, { max: 1, ssl: url.includes('localhost') ? false : 'require', onnotice: (n) => console.log(n.message) });
const dir = path.join(process.cwd(), 'supabase', 'seed', 'test');
const quote = (s) => `'${s.replace(/'/g, "''")}'`;
try {
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    const text = (await readFile(path.join(dir, file), 'utf8')).replaceAll(':email', quote(email));
    console.log(`seed ${file}`);
    if (process.env.MIGRATION_MODE === 'direct') await sql.unsafe(text);
    else await sql`select private.exec(${text})`;
  }
} catch (e) {
  console.error(e.message, e.where?.split('\n').slice(-2).join(' | ') ?? '');
  process.exitCode = 1;
} finally {
  await sql.end();
}
