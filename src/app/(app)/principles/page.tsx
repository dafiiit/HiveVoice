import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { btn } from "@/components/ui/styles";
import { Page, PageHeader } from "@/components/ui/Page";
import { InfoTabs } from "@/components/InfoTabs";

type Principle = { title: string; text: string };

export async function generateMetadata() {
  return { title: (await getTranslations("principles"))("title") };
}

// One row per principle: a huge number on the left, title and text pushed to the right.
export default async function Principles() {
  const t = await getTranslations("principles");
  const session = await getSession();
  const items = t.raw("items") as Principle[];
  return (
    <Page>
      <PageHeader title={t("title")} lead={t("lead")} />
      <InfoTabs active="principles" />
      <article className="flex flex-col">
      <ol className="m-0 list-none p-0">
        {items.map((p, i) => (
          <li key={i} className="grid gap-4 border-b border-line py-8 first:pt-2 md:grid-cols-[minmax(0,1fr)_minmax(0,520px)] md:gap-10 md:py-12">
            <span aria-hidden="true" className="tabular text-[clamp(88px,11vw,176px)] font-light leading-[0.8] tracking-[-0.05em]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-4">
              <h2 className="m-0 text-2xl font-bold leading-tight md:text-3xl">{p.title}</h2>
              <p className="m-0 max-w-[500px] leading-relaxed">{p.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <footer className="flex flex-col gap-8 pt-10 md:pt-14">
        <p className="m-0 max-w-[900px] text-[clamp(32px,4vw,56px)] font-bold leading-[1] tracking-[-0.03em]">{t("closing")}</p>
        <div className="flex flex-wrap gap-3">
          {!session && <Link href="/signup" className={btn.primary}>{t("join")}</Link>}
          <a href="https://github.com/dafiiit/HiveVoice" className={btn.secondary}>{t("source")}</a>
        </div>
      </footer>
      </article>
    </Page>
  );
}
