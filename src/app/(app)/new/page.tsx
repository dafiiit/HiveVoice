import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/lib/session";
import { Glyph } from "@/components/ui/Glyph";
import { Page, PageHeader } from "@/components/ui/Page";
import { NEW_ITEMS } from "@/components/new/items";

export async function generateMetadata() {
  return { title: (await getTranslations("new"))("title") };
}

/** Everything you can start, as equal tiles: the same words as on the buttons elsewhere. */
export default async function NewPage() {
  await requireSession("/new");
  const t = await getTranslations("new");
  return (
    <Page>
      <PageHeader title={t("title")} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {NEW_ITEMS.map((o) => (
          <Link key={o.key} href={o.href} className="flex items-center gap-4 border border-ink bg-surface p-4 text-ink no-underline hover:bg-chip md:items-start md:p-6">
            <span className="flex-none max-md:[&>svg]:size-10"><Glyph shape={o.shape} size={48} color="var(--ink)" /></span>
            <span className="flex min-w-0 flex-col gap-1 md:gap-2">
              <strong className="text-xl leading-tight">{t(`tiles.${o.key}.title`)}</strong>
              <span className="max-md:text-sm">{t(`tiles.${o.key}.text`)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Page>
  );
}
