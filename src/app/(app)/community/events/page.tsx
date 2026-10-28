import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getPlace } from "@/lib/place";
import { dayStart, loadCalendar } from "@/lib/calendar";
import { Agenda } from "@/components/calendar/Agenda";
import { EventForm } from "@/components/calendar/EventForm";
import { Page, PageHeader, Section } from "@/components/ui/Page";
import { IconPlus } from "@/components/ui/Icons";
import { btn } from "@/components/ui/styles";

export async function generateMetadata() {
  return { title: (await getTranslations("calendar"))("publicTitle") };
}

/** Gemeinschaft → Termine: everybody's public dates of the next eight weeks, those of one's own place first. */
export default async function PublicEvents() {
  const session = await getSession();
  const t = await getTranslations("calendar");
  const place = await getPlace();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const items = await asViewer(viewer, (tx) => loadCalendar(tx, dayStart(0), dayStart(56), "public"));
  const near = new Set(place?.chain.map((r) => r.id) ?? []);
  const here = near.size ? items.filter((o) => o.region_id && near.has(o.region_id)) : items;
  const rest = near.size ? items.filter((o) => !o.region_id || !near.has(o.region_id)) : [];
  const where = place?.name;
  return (
    <Page>
      <PageHeader title={t("publicTitle")} mobileHidden actions={session
        ? <EventForm context={{ canPublic: true, regionId: session.profile.home_region_id }} label={<><IconPlus size={16} /> {t("new")}</>} />
        : <Link href="/login?next=/community/events" className={btn.primary}><IconPlus size={16} /> {t("new")}</Link>} />
      {near.size > 0 ? (
        <>
          <Section title={where ?? t("publicTitle")}>
            <Agenda items={here} me={session?.profile.id ?? null} showGroup empty={t("emptyPublic")} />
          </Section>
          {rest.length > 0 && <Section title={t("more")}><Agenda items={rest} me={session?.profile.id ?? null} showGroup empty="" /></Section>}
        </>
      ) : <Agenda items={items} me={session?.profile.id ?? null} showGroup empty={t("emptyPublic")} />}
    </Page>
  );
}
