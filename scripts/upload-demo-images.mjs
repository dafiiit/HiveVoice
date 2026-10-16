// Uploads supabase/seed/images/* to the "demo" folder of the image bucket (Supabase Storage).
// Writing there is allowed for server admins only, so the test account is made admin for the
// time of the upload and loses that right again (unless it already had it). Needs TEST_USER_EMAIL, TEST_USER_PASSWORD and
// MIGRATION_DATABASE_URL (see .env.example). Run once after npm run db:seed.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, TEST_USER_EMAIL: email, TEST_USER_PASSWORD: password, MIGRATION_DATABASE_URL: db } = process.env;
if (!url || !key || !email || !password || !db) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD and MIGRATION_DATABASE_URL');

const supabase = createClient(url, key);
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;
const uid = data.user.id;
const sql = postgres(db, { max: 1, ssl: db.includes('localhost') ? false : 'require', onnotice: () => {} });
const app = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL, { max: 1, ssl: process.env.DATABASE_URL.includes('localhost') ? false : 'require', prepare: false, onnotice: () => {} }) : null;
// Do not take away admin rights the account already had.
const wasAdmin = app ? Boolean((await app`select app.session_profile(${uid}) as p`)[0]?.p?.is_admin) : false;
const grant = `insert into public.server_admins (profile_id) select id from public.profiles where auth_user_id = '${uid}' on conflict do nothing`;
const revoke = `delete from public.server_admins where profile_id = (select id from public.profiles where auth_user_id = '${uid}')`;
try {
  await sql`select private.exec(${grant})`;
  const dir = path.join(process.cwd(), 'supabase', 'seed', 'images');
  for (const file of (await readdir(dir)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))) {
    const body = await readFile(path.join(dir, file));
    const type = file.endsWith('.png') ? 'image/png' : file.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    // Replace an earlier copy: removing first keeps this working without a select policy on the bucket.
    await supabase.storage.from('images').remove([`demo/${file}`]);
    const { error: up } = await supabase.storage.from('images').upload(`demo/${file}`, body, { contentType: type, cacheControl: '31536000' });
    console.log(up ? `FAILED  demo/${file}: ${up.message}` : `uploaded demo/${file}`);
    if (up) process.exitCode = 1;
  }
} finally {
  if (!wasAdmin) await sql`select private.exec(${revoke})`;
  await sql.end();
  await app?.end();
}
