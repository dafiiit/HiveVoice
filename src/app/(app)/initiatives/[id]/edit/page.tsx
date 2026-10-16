import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { InitiativeWizard } from "@/components/new/InitiativeWizard";

export default async function EditInitiative({ params }: PageProps<"/initiatives/[id]/edit">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await requireSession(`/initiatives/${id}/edit`);
  const t = await getTranslations("new");
  const row = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => {
    const [i] = await tx<{ id: string; title: string; summary: string | null; body: string | null; body_easy: string | null; addressee_responsibility_id: string | null; addressee_label: string | null; addressee_text: string | null; cost_estimate_cents: number | null; is_author: boolean }[]>`
      select i.id, i.title, i.summary, i.body, i.body_easy, i.addressee_responsibility_id, coalesce(s.organization_name || ' · ', '') || s.title as addressee_label,
             i.addressee_text, i.cost_estimate_cents,
             exists (select 1 from public.initiative_authors a where a.initiative_id = i.id and a.profile_id = ${session.profile.id}) as is_author
      from public.initiatives i left join public.responsibilities s on s.id = i.addressee_responsibility_id where i.id = ${id}`;
    return i;
  });
  if (!row || !row.is_author) notFound();
  return (
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4 md:gap-8 md:px-10 md:pb-20 md:pt-10">
      <h1 className="display m-0">{t("initiative.editTitle")}</h1>
      <InitiativeWizard chain={[]} initial={{
        id: row.id, title: row.title, summary: row.summary ?? "", body: row.body ?? "", bodyEasy: row.body_easy ?? "",
        addresseeId: row.addressee_responsibility_id ?? "", addresseeLabel: row.addressee_label ?? "", addresseeText: row.addressee_text ?? "",
        costEuro: row.cost_estimate_cents ? String(row.cost_estimate_cents / 100) : "",
      }} />
    </div>
  );
}
