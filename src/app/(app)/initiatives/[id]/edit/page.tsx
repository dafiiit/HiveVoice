import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { InitiativeWizard } from "@/components/new/InitiativeWizard";
import { Page, PageHeader } from "@/components/ui/Page";

export default async function EditInitiative({ params }: PageProps<"/initiatives/[id]/edit">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await requireSession(`/initiatives/${id}/edit`);
  const t = await getTranslations("new");
  const ti = await getTranslations("initiative");
  const row = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => {
    const [i] = await tx<{ id: string; title: string; summary: string | null; body: string | null; body_easy: string | null; addressee_responsibility_id: string | null; addressee_label: string | null; addressee_text: string | null; cost_estimate_cents: number | null; is_author: boolean; phase: string; outcome: string | null; frozen: boolean }[]>`
      select i.id, i.title, i.summary, i.body, i.body_easy, i.addressee_responsibility_id, coalesce(s.organization_name || ' · ', '') || s.title as addressee_label,
             i.addressee_text, i.cost_estimate_cents,
             app.can_edit_initiative(i.id) as is_author, i.phase::text, i.outcome::text, app.initiative_frozen(i.id) as frozen
      from public.initiatives i left join public.responsibilities s on s.id = i.addressee_responsibility_id where i.id = ${id}`;
    return i;
  });
  if (!row || !row.is_author || row.outcome) notFound();
  return (
    <Page>
      <PageHeader title={t("initiative.editTitle")} back={{ href: `/initiatives/${id}`, label: ti("back") }} />
      <InitiativeWizard chain={[]} initial={{
        id: row.id, title: row.title, summary: row.summary ?? "", body: row.body ?? "", bodyEasy: row.body_easy ?? "",
        addresseeId: row.addressee_responsibility_id ?? "", addresseeLabel: row.addressee_label ?? "", addresseeText: row.addressee_text ?? "",
        costEuro: row.cost_estimate_cents ? String(row.cost_estimate_cents / 100) : "",
        noteMode: row.frozen ? "frozen" : row.phase === "debate" ? "debate" : "none",
      }} />
    </Page>
  );
}
