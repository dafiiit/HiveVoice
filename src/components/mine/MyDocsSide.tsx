import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { formatSize } from "@/lib/files";
import { MyDocuments, type DocRow, type SharedRow, type IncomingTransfer } from "@/components/me/MyDocuments";
import { Page, PageHeader } from "@/components/ui/Page";
import { NextcloudGallery } from "@/components/nextcloud/NextcloudGallery";
import { links } from "@/lib/nextcloud";

/** Right side of Ich → Notizen / Diagramme / Uploads before one is opened: shared with me, hand-overs, trash (and storage for uploads). */
export async function MyDocsSide({ kind, sub = "" }: { kind: "notes" | "diagrams" | "uploads"; /** Uploads: a folder inside the Nextcloud gallery. */ sub?: string }) {
  const session = await requireSession(`/me/${kind}`);
  const me = session.profile.id;
  const t = await getTranslations("mine");
  const notes = kind !== "uploads";
  const origins = kind === "notes" ? ["note"] : kind === "diagrams" ? ["diagram"] : ["link", "file"];
  const d = await asViewer({ authId: session.authId, profileId: me }, async (tx) => {
    const docs = await tx<DocRow[]>`
      select id, title, origin, visibility, license, version_no, trashed_at, updated_at from public.resources
      where owner_id = ${me} and origin in ${tx(origins)} order by trashed_at nulls first, updated_at desc limit 300`;
    const shared = await tx<SharedRow[]>`
      select r.id, r.title, g.level, o.display_name as owner from public.resource_grants g join public.resources r on r.id = g.resource_id join public.profiles o on o.id = r.owner_id
      where g.profile_id = ${me} and (g.expires_at is null or g.expires_at > now()) and r.trashed_at is null
        and r.origin in ${tx(origins)} order by g.created_at desc limit 100`;
    const transfers = await tx<IncomingTransfer[]>`
      select t.id, r.title, p.display_name as by from public.resource_transfers t join public.resources r on r.id = t.resource_id join public.profiles p on p.id = t.from_id
      where t.to_id = ${me} and t.status = 'proposed'`;
    const [usage] = notes ? [{ u: { used: 0, limit: 0 } }] : await tx<{ u: { used: number; limit: number } }[]>`select app.storage_usage() as u`;
    return { docs, shared, transfers, usage: usage.u };
  });
  // Uploads: the photos of one's own Nextcloud folder come first, when one chose one (Einstellungen → Nextcloud).
  const viewer = { authId: session.authId, profileId: me };
  const cloud = kind === "uploads" ? (await links(viewer).catch(() => [])).find((l) => !l.group_id && l.owner_id === me && l.folder) : undefined;
  return (
    <Page width="narrow">
      <PageHeader title={t(kind === "notes" ? "myNotes" : kind === "diagrams" ? "myDiagrams" : "myUploads")} lead={t("pick")} />
      {cloud && <NextcloudGallery viewer={viewer} link={cloud} sub={sub} base="/me/uploads" />}
      <MyDocuments hideMine docs={d.docs} shared={d.shared} incoming={d.transfers} trashDays={30}
        usage={notes ? null : { used: formatSize(d.usage.used), limit: formatSize(d.usage.limit) }} />
    </Page>
  );
}
