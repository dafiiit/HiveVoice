import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { sql } from "@/lib/db";
import { adminState } from "@/lib/admin";
import { Logo } from "@/components/ui/Logo";
import { AdminPanel, ClaimAdmin } from "@/components/admin/AdminPanel";
import { btn } from "@/components/ui/styles";

export const metadata = { title: "Verwaltung", robots: { index: false, follow: false } };

export default async function SysAdmin() {
  const state = await adminState();
  if (!state.allowed && (state.reason === "gate" || state.reason === "forbidden")) notFound();
  const t = await getTranslations("admin");
  const [{ o }] = state.allowed ? await sql`select app.admin_overview() as o` : [{ o: null }];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-line px-6 py-4 md:px-10">
        <Link href="/" className="text-ink no-underline"><Logo size={36} /></Link>
        <span className="text-sm font-bold">{t("title")}</span>
      </header>
      <main className="flex flex-col gap-5 px-4 pb-8 pt-4 md:gap-8 md:px-10">
        <h1 className="display m-0">{t("title")}</h1>
        {!state.allowed && state.reason === "login" && (
          <div className="flex flex-col gap-3"><p className="m-0">{t("loginFirst")}</p><Link href="/login" className={`${btn.primary} self-start`}>{t("login")}</Link></div>
        )}
        {!state.allowed && state.reason === "bootstrap" && (
          <div className="flex max-w-[640px] flex-col gap-4"><p className="m-0 text-lg">{t("bootstrap")}</p><ClaimAdmin /></div>
        )}
        {state.allowed && o && <AdminPanel o={o} me={state.session.profile.id} />}
      </main>
    </div>
  );
}
