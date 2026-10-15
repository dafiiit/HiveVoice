import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/session";
import { Glyph } from "@/components/ui/Glyph";

export async function generateMetadata() {
  return { title: (await getTranslations("new"))("title") };
}

export default async function NewPage() {
  await requireSession("/new");
  const t = await getTranslations("new");
  const options = [
    { href: "/needs", shape: "lupe", key: "need", dark: false },
    { href: "/offers", shape: "gift", key: "offer", dark: false },
    { href: "/new/group", shape: "flower", key: "group", dark: true },
    { href: "/connect?c=market", shape: "bubble", key: "voice", dark: false },
  ] as const;
  return (
    <div className="flex flex-col gap-8 px-6 pb-12 pt-8 md:px-10 md:pb-20 md:pt-10">
      <h1 className="display m-0">{t("title")}</h1>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {options.map((o) => (
          <Link key={o.key} href={o.href} className={`flex min-h-[220px] flex-col gap-4 p-6 no-underline ${o.dark ? "bg-ink text-on-ink" : "border border-ink bg-surface text-ink"}`}>
            <Glyph shape={o.shape} size={56} color={o.dark ? "var(--on-ink)" : "var(--ink)"} />
            <strong className="text-2xl leading-tight">{t(`${o.key}.title`)}</strong>
            <span>{t(`${o.key}.text`)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
