import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { JuryReview } from "@/components/jury/JuryReview";
import { Page } from "@/components/ui/Page";

export async function generateMetadata() {
  return { title: (await getTranslations("jury"))("title") };
}

export default async function JuryPage({ params }: PageProps<"/jury/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const session = await requireSession(`/jury/${id}`);
  const c = await asViewer({ authId: session.authId, profileId: session.profile.id }, async (tx) => {
    const [row] = await tx<{ id: string; case_no: string; status: string; context_text: string | null; target_text: string | null; jury_size: number; rule: string; decided: boolean }[]>`
      select c.id, c.case_no, c.status::text, c.context_text, c.target_text, c.jury_size, r.rule::text,
             (s.choice is not null or s.declined) as decided
      from public.jury_cases c join public.jury_seats s on s.case_id = c.id and s.juror_id = ${session.profile.id}
      join public.reports r on r.id = c.report_id where c.id = ${id}`;
    return row;
  });
  if (!c) notFound();
  return (
    <Page width="narrow">
      <JuryReview caseId={c.id} caseNo={c.case_no} rule={c.rule} context={c.context_text} target={c.target_text} decided={c.decided} status={c.status} jurySize={c.jury_size} />
    </Page>
  );
}
