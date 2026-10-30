// What real devices reported in the last days: server errors, browser errors, speed (docs/debugging.md). `npm run reports -- 30`
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const days = Number(process.argv[2] ?? 7);
const sql = postgres(url, { max: 1, prepare: false, ssl: /localhost|sslmode=disable/.test(url) ? false : 'require', onnotice: () => {} });
try {
  const rows = await sql`select * from app.client_report_summary(${days})`;
  if (!rows.length) console.log(`Keine Berichte in den letzten ${days} Tagen.`);
  for (const r of rows) {
    const value = r.kind === 'vital' ? ` Schnitt ${Math.round(r.average * 100) / 100}, schlimmster ${Math.round(r.worst * 100) / 100}, schlecht ${r.poor}` : '';
    console.log(`${r.kind.padEnd(13)} ${String(r.hits).padStart(6)}× ${r.device.padEnd(8)} ${r.path}  ${r.name}${value}${r.release ? `  [${r.release}]` : ''}`);
    if (r.kind !== 'vital' && r.detail) console.log(`  ${r.detail.split('\n').slice(0, 3).join('\n  ')}`);
  }
} finally {
  await sql.end();
}
