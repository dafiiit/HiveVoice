import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Notice, Page, PageHeader } from "@/components/ui/Page";
import { InfoTabs } from "@/components/InfoTabs";

export async function generateMetadata({ params }: PageProps<"/legal/[page]">) {
  const { page } = await params;
  if (page !== "imprint" && page !== "privacy") return {};
  return { title: (await getTranslations("legal"))(`${page}.title`) };
}

// Placeholders: the operator of the instance fills in their own details.
export default async function Legal({ params }: PageProps<"/legal/[page]">) {
  const { page } = await params;
  if (page !== "imprint" && page !== "privacy") notFound();
  const t = await getTranslations("legal");
  const paragraphs = t.raw(`${page}.body`) as string[];
  return (
    <Page>
      <PageHeader title={t(`${page}.title`)} />
      <InfoTabs active={page} />
      <article className="flex max-w-[720px] flex-col gap-4">
        <Notice tone="warning">{t("placeholder")}</Notice>
        {paragraphs.map((p, i) => <p key={i} className="m-0 whitespace-pre-line leading-relaxed">{p}</p>)}
      </article>
    </Page>
  );
}
