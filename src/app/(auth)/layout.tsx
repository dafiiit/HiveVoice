import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/ui/Logo";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("auth");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4 md:px-10">
        <Link href="/" className="text-ink no-underline"><Logo size={40} /></Link>
        <Link href="/explore" className="inline-flex h-11 items-center font-bold text-ink">{t("guest")}</Link>
      </header>
      <main className="flex-1 px-6 pb-20 pt-8 md:px-10 md:pt-16">
        <div className="flex max-w-[720px] flex-col gap-10 md:pl-[25%]">{children}</div>
      </main>
    </div>
  );
}
