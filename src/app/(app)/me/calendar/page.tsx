import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getOrigin } from "@/lib/origin";
import { dayStart, loadCalendar } from "@/lib/calendar";
import { Agenda } from "@/components/calendar/Agenda";
import { EventForm } from "@/components/calendar/EventForm";
import { CalendarSettings } from "@/components/calendar/CalendarSettings";
import { Page, PageHeader } from "@/components/ui/Page";
import { IconPlus } from "@/components/ui/Icons";
import { segment, segments } from "@/components/ui/styles";

export async function generateMetadata() {
  return { title: (await getTranslations("calendar"))("title") };
}

const RANGES = { week: 7, month: 28, quarter: 91 } as const;

/** Ich → Kalender: my own dates, those I am invited to, my groups' dates and duties, public dates I said yes to. */
export default async function MyCalendar({ searchParams }: PageProps<"/me/calendar">) {
  const sp = await searchParams;
  const session = await requireSession();
  const t = await getTranslations("calendar");
  const range = (Object.keys(RANGES) as (keyof typeof RANGES)[]).find((k) => k === sp.r) ?? "month";
  // ?w=-1 one period back, ?w=1 one ahead.
  const shift = Math.max(-52, Math.min(52, Number(sp.w) || 0));
  const from = dayStart(shift * RANGES[range]), to = dayStart((shift + 1) * RANGES[range]);
  const viewer = { authId: session.authId, profileId: session.profile.id };
  const { items, prefs } = await asViewer(viewer, async (tx) => ({
    items: await loadCalendar(tx, from, to, "mine"),
    prefs: (await tx<{ s: { remind_day: boolean; remind_hour: boolean; feed_token: string } }[]>`select app.calendar_settings('{}'::jsonb) as s`)[0].s,
  }));
  const href = (p: { r?: string; w?: number }) => {
    const q = new URLSearchParams();
    const r = p.r ?? range; if (r !== "month") q.set("r", r);
    const w = p.w ?? shift; if (w) q.set("w", String(w));
    return `/me/calendar${q.size ? `?${q}` : ""}`;
  };
  return (
    <Page aside={<CalendarSettings origin={await getOrigin()} prefs={prefs} />}>
      <PageHeader title={t("title")} mobileHidden actions={
        <EventForm context={{ canPublic: true, regionId: session.profile.home_region_id }} defaultOpen={sp.new === "1"} label={<><IconPlus size={16} /> {t("new")}</>} />
      } />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span role="group" aria-label={t("range")} className={segments}>
          {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
            <Link key={k} href={href({ r: k, w: 0 })} aria-current={k === range ? "true" : undefined} className={segment(k === range)}>{t(`ranges.${k}`)}</Link>
          ))}
        </span>
        <span className={segments}>
          <Link href={href({ w: shift - 1 })} className={segment(false)}>← {t("earlier")}</Link>
          {shift !== 0 && <Link href={href({ w: 0 })} className={segment(false)}>{t("today")}</Link>}
          <Link href={href({ w: shift + 1 })} className={segment(false)}>{t("later")} →</Link>
        </span>
      </div>
      <Agenda items={items} me={session.profile.id} showGroup empty={t("empty")} />
    </Page>
  );
}
