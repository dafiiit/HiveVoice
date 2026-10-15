import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/lib/session";
import { btn } from "@/components/ui/styles";

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
    <article className="flex flex-col px-6 pb-16 pt-10 md:px-10 md:pb-24 md:pt-16">
      <header className="flex flex-col gap-6 pb-12 md:pb-20">
        <h1 className="m-0 text-[clamp(40px,5vw,72px)] font-light uppercase leading-none tracking-[-0.02em]">{t("title")}</h1>
        <p className="m-0 max-w-[620px] text-xl leading-snug">{t("lead")}</p>
      </header>
      <ol className="m-0 list-none p-0">
        {items.map((p, i) => (
          <li key={i} className="grid gap-4 border-t border-line py-8 md:grid-cols-[minmax(0,1fr)_minmax(0,520px)] md:gap-10 md:py-12">
            <span aria-hidden="true" className="tabular text-[clamp(88px,11vw,176px)] font-light leading-[0.8] tracking-[-0.05em]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="flex flex-col gap-4">
              <h2 className="m-0 text-[clamp(26px,2.4vw,36px)] font-normal leading-[1.1] tracking-[-0.01em]">{p.title}</h2>
              <p className="m-0 max-w-[500px] leading-relaxed">{p.text}</p>
            </div>
          </li>
        ))}
      </ol>
      <footer className="flex flex-col gap-8 border-t-[6px] border-ink pt-10 md:pt-14">
        <p className="m-0 max-w-[900px] text-[clamp(32px,4vw,56px)] font-bold leading-[1] tracking-[-0.03em]">{t("closing")}</p>
        <div className="flex flex-wrap gap-3">
          {!session && <Link href="/signup" className={btn.primaryLg}>{t("join")}</Link>}
          <a href="https://github.com/dafiiit/HiveVoice" className={btn.secondaryLg}>{t("source")}</a>
        </div>
      </footer>
    </article>
  );
}
