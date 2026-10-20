"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { decideContact, withdrawContact } from "@/lib/actions/listings";
import { decideJoin, withdrawJoin } from "@/lib/actions/groups";
import { dateTime } from "@/lib/format";
import { Avatar } from "../ui/Avatar";
import { btn } from "../ui/styles";

export type RequestView = {
  id: string;
  type: "contact" | "join";
  outgoing: boolean;
  status: string;
  message: string | null;
  created_at: string | Date;
  title: string | null;          // listing title, or group name for join requests
  listing_id: string | null;
  listing_kind: string | null;
  group_slug: string | null;
  via_id?: string | null;        // the sender's own listing this request refers to
  via_title?: string | null;
  via_kind?: string | null;
  other_id: string;
  other_name: string;
  other_seed: number;
  other_path: string | null;
};

/** A sent or received request, shown where the chat will open once it is accepted. */
export function RequestPane({ r }: { r: RequestView }) {
  const t = useTranslations("connect");
  const tl = useTranslations("listings");
  const locale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pendingState = r.status === "pending";
  const join = r.type === "join";
  const group = r.title ?? "";

  const act = (fn: () => Promise<{ ok: boolean; data?: unknown }>, after?: (data: unknown) => void) => start(async () => {
    const res = await fn();
    if (!res.ok) return setError(t("sendFailed"));
    if (after) after(res.data);
    else router.replace("/connect?f=requests");
    router.refresh();
  });

  const heading = join
    ? (r.outgoing ? group : r.other_name)
    : r.other_name;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3 border-b border-line pb-3">
        <Avatar name={heading} seed={join && r.outgoing ? undefined : r.other_seed} path={join && r.outgoing ? null : r.other_path} size={48} group={join && r.outgoing} />
        <div className="flex min-w-0 flex-col">
          <strong className="truncate text-lg">{heading}</strong>
          <span className="text-sm text-muted">
            {join
              ? t(r.outgoing ? "req.outJoin" : "req.inJoin")
              : r.listing_id ? t(r.outgoing ? "req.outContact" : "req.inContact", { title: r.title ?? "" }) : t(r.outgoing ? "req.outDirect" : "req.inDirect")}
          </span>
          {r.via_id && r.via_title && (
            <Link href={`/${r.via_kind === "need" ? "needs" : "offers"}/${r.via_id}`} className="text-sm font-bold text-ink">{tl("viaLine", { title: r.via_title })}</Link>
          )}
        </div>
        <span className={`ml-auto flex-none px-2 py-1 text-sm font-bold ${pendingState ? "border border-ink" : "bg-chip"}`}>
          {t(!pendingState ? "req.declined" : r.outgoing ? "req.pending" : "req.newTag")}
        </span>
      </header>

      <section className="flex flex-col gap-1">
        <span className="text-sm text-muted">{r.outgoing ? t("req.yourMessage") : t("req.theirMessage", { name: r.other_name })} · {dateTime(r.created_at, locale)}</span>
        <p className={`m-0 max-w-[560px] whitespace-pre-line break-words px-3.5 py-2.5 ${r.outgoing ? "self-end bg-ink text-on-ink" : "border border-line bg-surface"}`}>{r.message}</p>
      </section>

      {pendingState && r.outgoing && (
        <p className="m-0 text-sm">{join ? t("req.waitingForGroup", { group }) : t("req.waitingFor", { name: r.other_name })}</p>
      )}
      {!pendingState && r.outgoing && (
        <p className="m-0 text-sm font-bold">{join ? t("req.declinedGroup") : t("req.declinedBy", { name: r.other_name })}</p>
      )}
      {pendingState && !r.outgoing && !join && <p className="m-0 text-sm text-muted">{t("req.answerHint")}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {pendingState && !r.outgoing && !join && (
          <>
            <button type="button" disabled={pending} className={btn.primary}
              onClick={() => act(() => decideContact(r.id, true), (c) => router.replace(c ? `/connect?c=d:${c}` : "/connect?f=requests"))}>{t("req.accept")}</button>
            <button type="button" disabled={pending} className={btn.secondary} onClick={() => act(() => decideContact(r.id, false))}>{t("req.decline")}</button>
          </>
        )}
        {pendingState && !r.outgoing && join && r.group_slug && (
          <>
            <button type="button" disabled={pending} className={btn.primary} onClick={() => act(() => decideJoin(r.group_slug!, r.id, true))}>{t("req.acceptJoin")}</button>
            <button type="button" disabled={pending} className={btn.secondary} onClick={() => act(() => decideJoin(r.group_slug!, r.id, false))}>{t("req.declineJoin")}</button>
          </>
        )}
        {pendingState && r.outgoing && (
          <button type="button" disabled={pending} className={btn.secondary} onClick={() => act(() => (join ? withdrawJoin(r.id) : withdrawContact(r.id)))}>{t("req.withdraw")}</button>
        )}
        {join && r.group_slug && <Link href={`/groups/${r.group_slug}`} className={btn.secondary}>{t("req.openGroup")}</Link>}
        {!join && r.listing_id && <Link href={`/${r.listing_kind === "need" ? "needs" : "offers"}/${r.listing_id}`} className={btn.secondary}>{t("openListing")}</Link>}
        {(!join || !r.outgoing) && <Link href={`/profile/${r.other_id}`} className={btn.secondary}>{t("openProfile")}</Link>}
      </div>
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 text-sm font-bold">{error}</p>}
    </div>
  );
}
