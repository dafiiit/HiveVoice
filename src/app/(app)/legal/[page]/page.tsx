import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";

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
    <article className="flex max-w-[760px] flex-col gap-4 px-4 pb-6 pt-4 md:gap-5 md:px-10 md:pb-20 md:pt-10">
      <h1 className="display m-0">{t(`${page}.title`)}</h1>
      <p className="m-0 border-l-4 border-red pl-3 font-bold">{t("placeholder")}</p>
      {paragraphs.map((p, i) => <p key={i} className="m-0 whitespace-pre-line leading-relaxed">{p}</p>)}
    </article>
  );
}
