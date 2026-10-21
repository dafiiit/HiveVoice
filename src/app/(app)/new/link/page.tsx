import { redirect } from "next/navigation";

// Notes and uploads are made inside Ich; old links (also from groups: ?group=) keep working.
export default async function NewLink({ searchParams }: PageProps<"/new/link">) {
  const sp = await searchParams;
  const p = new URLSearchParams();
  if (typeof sp.group === "string") p.set("group", sp.group);
  if (sp.mode === "link") p.set("mode", "link");
  redirect(`${sp.mode === "note" ? "/me/notes/new" : "/me/uploads/new"}${p.size ? `?${p}` : ""}`);
}
