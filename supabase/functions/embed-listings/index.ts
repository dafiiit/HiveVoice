// Computes the embeddings of listings that have none or an outdated one, with the gte-small model that runs inside
// Supabase (no text leaves the platform). It only ever works off what app.pending_embeddings returns, so calling it
// needs no key: without pending work it does nothing. The app calls it after saving a listing.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.5";

const model = new Supabase.ai.Session("gte-small");
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { max: 1, prepare: false });

Deno.serve(async () => {
  const rows = await sql<{ id: string; body: string }[]>`select id, body from app.pending_embeddings(8)`;
  for (const r of rows) {
    const embedding = (await model.run(r.body, { mean_pool: true, normalize: true })) as number[];
    await sql`select app.store_embedding(${r.id}, ${JSON.stringify(embedding)}, md5(${r.body}))`;
  }
  return Response.json({ embedded: rows.length });
});
