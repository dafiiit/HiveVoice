"use server";
import { asViewer } from "../db";

export async function findSimilar(title: string) {
  const words = title.toLowerCase().split(/[^a-zäöüß0-9]+/).filter((w) => w.length > 4).slice(0, 5);
  if (!words.length) return [];
  return asViewer(null, (tx) => tx<{ id: string; title: string; region: string; supports: number }[]>`
    select i.id, i.title, r.name as region, i.support_count as supports from public.initiatives i join public.regions r on r.id = i.region_id
    where i.published_at is not null and i.outcome is null
      and exists (select 1 from unnest(${words}::text[]) w where lower(i.title) like '%' || w || '%')
    order by i.support_count desc limit 3`);
}
