import Link from "next/link";
import { Page, PageHeader } from "@/components/ui/Page";
import { InfoTabs } from "@/components/InfoTabs";
import { getLocale, getTranslations } from "next-intl/server";
import { asViewer } from "@/lib/db";
import { getSession } from "@/lib/session";
import { dateTime } from "@/lib/format";
import { Notice } from "@/components/ui/Page";

type Explained = { action: string; allowed: boolean; reason: string | null; min_level: number; limit: number | null; used: number };
type Rights = {
  level: number; mode: "login" | "vouch" | "eid"; vouches: { id: string; name: string }[]; vouches_given: number; account_age_hours: number | null;
  sanction: { kind: "pause" | "ban"; ends_at: string | null; reason: string | null } | null; actions: Explained[];
};

export async function generateMetadata() {
  return { title: (await getTranslations("rights"))("title") };
}

/** What the signed-in person may do, why, and what is missing for the next level. Readable by guests too (they are level 0). */
export default async function RightsPage() {
  const t = await getTranslations("rights");
  const locale = await getLocale();
  const session = await getSession();
  const viewer = session ? { authId: session.authId, profileId: session.profile.id } : null;
  const { r, matrix } = await asViewer(viewer, async (tx) => ({
    r: (await tx<{ r: Rights }[]>`select app.my_rights() as r`)[0].r,
    matrix: await tx<{ action: string; resource: string }[]>`select action, resource from public.rights_matrix order by resource, position`,
  }));
  const groups = [...new Set(matrix.map((m) => m.resource))];
  const levels = t.raw("levels") as { name: string; text: string }[];
  const status = (a: Explained) =>
    a.allowed ? t("status.ok") : a.reason === "level_required" ? t("status.level_required", { level: a.min_level }) : t(`status.${a.reason as "banned"}`);
  return (
    <Page>
      <PageHeader title={t("title")} lead={t("leadShort")} />
      <InfoTabs active="rights" />

      <section aria-label={t("yourLevel", { name: levels[r.level].name })} className="flex flex-col gap-3 border border-ink border-t-[6px] bg-surface p-4 md:p-6">
        <strong className="text-2xl leading-tight">{t("yourLevel", { name: levels[r.level].name })}</strong>
        <span>{levels[r.level].text}</span>
        {session && r.level < 2 && <span className="text-sm">{t(`modes.${r.mode}`)}</span>}
        {session && r.level < 2 && r.mode === "vouch" && (
          <div className="flex flex-col gap-1 text-sm">
            <strong>{t("vouchProgress", { n: r.vouches.length })}</strong>
            <span>{r.vouches.length ? t("vouchedBy", { names: r.vouches.map((v) => v.name).join(", ") }) : t("vouchNone")}</span>
            {(r.account_age_hours ?? 0) < 24 && <span>{t("ageWait", { hours: r.account_age_hours ?? 0 })}</span>}
          </div>
        )}
        {session && r.level >= 2 && r.mode === "vouch" && <span className="text-sm text-muted">{t("vouchGiven", { n: r.vouches_given })}</span>}
        {r.sanction && (
          <Notice tone="error">
            {r.sanction.ends_at
              ? t("sanction", { kind: t(`kinds.${r.sanction.kind}`), date: dateTime(r.sanction.ends_at, locale) })
              : t("sanctionOpen", { kind: t(`kinds.${r.sanction.kind}`) })}
            {r.sanction.reason ? ` ${r.sanction.reason}` : ""}
          </Notice>
        )}
        {!session && <Link href="/login?next=/rechte" className="font-bold">{t("status.not_authenticated")}</Link>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold md:text-2xl">{t("actionsTitle")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-ink text-sm">
                <th scope="col" className="py-2 pr-3">{t("columns.action")}</th>
                <th scope="col" className="py-2 pr-3">{t("columns.needs")}</th>
                <th scope="col" className="py-2">{t("columns.today")}</th>
              </tr>
            </thead>
            <tbody>
              {r.actions.map((a) => (
                <tr key={a.action} className="border-b border-line align-top">
                  <th scope="row" className="py-2.5 pr-3 font-normal">{t(`actions.${a.action}` as "actions.post")}</th>
                  <td className="py-2.5 pr-3 text-sm">{levels[a.min_level].name}</td>
                  <td className={`py-2.5 text-sm ${a.allowed ? "" : "font-bold"}`}>
                    {status(a)}
                    {a.limit != null && <span className="block font-normal text-muted">{t("usage", { used: a.used, limit: a.limit })}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="m-0 text-sm text-muted">{t("limitsHint")}</p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="m-0 text-xl font-bold md:text-2xl">{t("matrixTitle")}</h2>
        <p className="m-0 max-w-[720px]">{t("matrixLead")}</p>
        {groups.map((g) => (
          <div key={g} className="flex flex-col">
            <h3 className="m-0 border-b-2 border-ink pb-1 text-base font-bold">{t(`objects.${g}` as "objects.resource")}</h3>
            <ul className="m-0 list-none p-0">
              {matrix.filter((m) => m.resource === g).map((m) => <li key={m.action} className="border-b border-line py-2 text-sm">{t(`matrix.${m.action}` as "matrix.resource.view")}</li>)}
            </ul>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold md:text-2xl">{t("levelsTitle")}</h2>
        <ol className="m-0 flex list-none flex-col p-0">
          {levels.map((l, i) => (
            <li key={l.name} aria-current={i === r.level ? "true" : undefined} className={`flex gap-4 border-b border-line py-3 ${i === r.level ? "bg-surface px-3 font-bold" : ""}`}>
              <span className="tabular w-6 flex-none text-xl font-bold">{i}</span>
              <span className="flex flex-col gap-0.5"><strong>{l.name}{i === r.level ? ` · ${t("youAreHere")}` : ""}</strong><span className={i === r.level ? "font-normal" : "text-muted"}>{l.text}</span></span>
            </li>
          ))}
        </ol>
        <Link href="/principles" className="self-start text-sm font-bold">{t("more")}</Link>
      </section>
    </Page>
  );
}
