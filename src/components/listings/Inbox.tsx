"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { decideContact, withdrawContact } from "@/lib/actions/listings";
import { relTime } from "@/lib/format";
import { Avatar } from "../ui/Avatar";
import { btn } from "../ui/styles";

export type ContactRow = { id: string; status: string; message: string; created_at: string; listing_title: string | null; via_title?: string | null; other_id: string; other_name: string; other_seed: number; other_path: string | null; conversation_id: string | null };

export function Inbox({ incoming, outgoing }: { incoming: ContactRow[]; outgoing: ContactRow[] }) {
  const t = useTranslations("market.inbox");
  const tl = useTranslations("listings");
  const locale = useLocale();
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <section className="flex flex-col">
        <h2 className="m-0 mb-2 border-b-2 border-ink pb-2 text-xl font-bold">{t("incoming")}</h2>
        {incoming.length === 0 && <p className="text-muted">{t("noIncoming")}</p>}
        {incoming.map((r) => (
          <div key={r.id} className="flex flex-col gap-2 border-b border-line py-4">
            <div className="flex items-center gap-3">
              <Avatar name={r.other_name} seed={r.other_seed} path={r.other_path} size={40} />
              <div className="flex flex-col"><Link href={`/profile/${r.other_id}`} className="font-bold text-ink no-underline">{r.other_name}</Link>
                <span className="text-sm text-muted">{t("about", { title: r.listing_title ?? "–" })} · {relTime(r.created_at, locale)}</span></div>
            </div>
            {r.via_title && <span className="text-sm font-bold">{tl("viaLine", { title: r.via_title })}</span>}
            <p className="m-0">{r.message}</p>
            {r.status === "pending" && (
              <div className="flex gap-2">
                <button type="button" disabled={pending} onClick={() => start(async () => { await decideContact(r.id, true); })} className={btn.primary}>{t("accept")}</button>
                <button type="button" disabled={pending} onClick={() => start(async () => { await decideContact(r.id, false); })} className={btn.secondary}>{t("decline")}</button>
              </div>
            )}
            {r.status === "accepted" && <span role="status" className="text-sm">{t("opened")} {r.conversation_id && <Link href={`/connect?c=d:${r.conversation_id}`} className="font-bold">{t("write")}</Link>}</span>}
            {r.status === "declined" && <span className="text-sm text-muted">{t("declined")}</span>}
          </div>
        ))}
      </section>
      <section className="flex flex-col">
        <h2 className="m-0 mb-2 border-b-2 border-ink pb-2 text-xl font-bold">{t("outgoing")}</h2>
        {outgoing.length === 0 && <p className="text-muted">{t("noOutgoing")}</p>}
        {outgoing.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border-b border-line py-3">
            <Avatar name={r.other_name} seed={r.other_seed} path={r.other_path} size={32} />
            <div className="flex min-w-0 flex-1 flex-col"><strong>{r.other_name}</strong><span className="text-sm">{r.listing_title}{r.via_title ? ` · ${tl("viaLine", { title: r.via_title })}` : ""}</span></div>
            <span className="text-sm font-bold">{t(`status.${r.status}`)}</span>
            {r.status === "pending" && <button type="button" disabled={pending} onClick={() => start(async () => { await withdrawContact(r.id); })} className="border-0 bg-transparent text-sm text-muted underline">{t("withdraw")}</button>}
            {r.status === "accepted" && r.conversation_id && <Link href={`/connect?c=d:${r.conversation_id}`} className="text-sm font-bold">{t("write")}</Link>}
          </div>
        ))}
      </section>
    </div>
  );
}
