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
    <div className="flex flex-col gap-4 px-4 pb-6 pt-4 md:gap-8 md:px-10 md:pb-20 md:pt-10">
      <h1 className="display m-0">{t("title")}</h1>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {options.map((o) => (
          <Link key={o.key} href={o.href} className={`flex items-center gap-4 p-4 no-underline md:min-h-[220px] md:flex-col md:items-stretch md:p-6 ${o.dark ? "bg-ink text-on-ink" : "border border-ink bg-surface text-ink"}`}>
            <span className="flex-none max-md:[&>svg]:size-10"><Glyph shape={o.shape} size={56} color={o.dark ? "var(--on-ink)" : "var(--ink)"} /></span>
            <span className="flex min-w-0 flex-col gap-1 md:gap-4">
              <strong className="text-xl leading-tight md:text-2xl">{t(`${o.key}.title`)}</strong>
              <span className="max-md:line-clamp-2 max-md:text-sm">{t(`${o.key}.text`)}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
