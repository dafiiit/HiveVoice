// Loads demo content (supabase/seed/demo.sql). Remove it again on the admin page.
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url) throw new Error('MIGRATION_DATABASE_URL is not set');
const sql = postgres(url, { max: 1, ssl: url.includes('localhost') ? false : 'require', onnotice: (n) => console.log(n.message) });
const text = await readFile('supabase/seed/demo.sql', 'utf8');
if (process.env.MIGRATION_MODE === 'direct') await sql.unsafe(text);
else await sql`select private.exec(${text})`.catch((e) => { console.error(e.message, e.where?.split("\n").slice(-2).join(" | ")); process.exitCode = 1; });
await sql.end();
