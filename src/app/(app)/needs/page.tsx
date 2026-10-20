import { redirect } from "next/navigation";

// Offering and looking live together under "Anliegen"; old links keep working.
export default async function Old({ searchParams }: PageProps<"/needs">) {
  const sp = await searchParams;
  const p = new URLSearchParams({ as: "need" });
  for (const k of ["title", "share", "paid"]) if (typeof sp[k] === "string") p.set(k, sp[k] as string);
  if (sp.tab === "inbox") p.set("tab", "inbox");
  else if (sp.tab === "near") p.set("tab", "offers");
  redirect(`/anliegen?${p}`);
}
