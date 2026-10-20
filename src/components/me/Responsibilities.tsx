"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  cancelTransfer, clearSubstitute, decideTransfer, deleteResponsibility, leaveResponsibility, proposeTransfer, saveResponsibility,
  setSubstitute, startOfficialVerification,
} from "@/lib/actions/responsible";
import { dateLong, relTime } from "@/lib/format";
import { LevelBadge } from "../responsible/LevelBadge";
import { searchPlaces, type Place } from "@/app/onboarding/actions";
import { TagPicker } from "../TagPicker";
import { btn, field } from "../ui/styles";
import { ConfirmAction } from "../ui/Action";
import { Notice } from "@/components/ui/Page";
import { PersonPicker } from "../ui/PersonPicker";
import type { PersonHit } from "@/lib/actions/people";

export type MyResp = {
  id: string; title: string; organization_name: string | null; description: string; region_id: string | null; region_name: string | null; is_official: boolean; official_domain: string | null; tags: string[]; open_requests: number;
  state: "active" | "pending_official" | "withdrawn"; level: "official" | "community" | "self"; confirm_count: number; confirm_min: number; is_primary: boolean;
  substitute_name: string | null; substitute_until: string | null; reconfirm_due: string | null; holders: string[]; transfer_id: string | null; transfer_to: string | null;
  dispute_id: string | null; history: { kind: string; at: string; name: string | null }[];
};

function Form({ initial, onDone, homeRegion }: { initial?: MyResp; onDone: () => void; homeRegion: { id: string; name: string } | null }) {
  const t = useTranslations("me.resp");
  const tc = useTranslations("common");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [org, setOrg] = useState(initial?.organization_name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [region, setRegion] = useState<{ id: string; name: string } | null>(initial?.region_id ? { id: initial.region_id, name: initial.region_name ?? "" } : homeRegion);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Place[]>([]);
  const [tags, setTags] = useState(initial?.tags ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    const h = setTimeout(() => { if (q.trim().length >= 2) searchPlaces(q).then(setHits); else setHits([]); }, 250);
    return () => clearTimeout(h);
  }, [q]);
  return (
    <div className="flex flex-col gap-3 border-2 border-ink bg-surface p-4">
      <label className={field.label}>{t("title")}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("titlePlaceholder")} className={field.input} /></label>
      <label className={field.label}>{t("org")} <span className={field.hint}>{tc("optional")}</span><input value={org} onChange={(e) => setOrg(e.target.value)} placeholder={t("orgPlaceholder")} className={field.input} /></label>
      <label className={field.label}>{t("scope")}<textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("scopePlaceholder")} className={field.textarea} /></label>
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{t("place")}: {region?.name ?? "–"}</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("placeSearch")} aria-label={t("place")} className={field.input} />
        {hits.map((h) => <button key={h.id} type="button" onClick={() => { setRegion({ id: h.id, name: h.name }); setQ(""); setHits([]); }} className="border-0 border-b border-line bg-transparent py-1.5 text-left text-ink">{h.name} <span className="text-sm text-muted">{h.context}</span></button>)}
      </div>
      <TagPicker label={t("topics")} value={tags} onChange={setTags} suggestions={[]} />
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending || title.trim().length < 2 || desc.trim().length < 5} onClick={() => start(async () => {
          const res = await saveResponsibility({ id: initial?.id, title, organizationName: org, description: desc, regionId: region?.id ?? "", tags });
          if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
          onDone();
        })} className={btn.primary}>{tc("save")}</button>
        <button type="button" onClick={onDone} className={btn.secondary}>{tc("cancel")}</button>
      </div>
    </div>
  );
}

function Verify({ id, label }: { id: string; label?: string }) {
  const t = useTranslations("me.resp");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn.secondary}>{label ?? t("verify")}</button>;
  return (
    <div className="flex flex-col gap-2 border border-line p-3">
      <span className="text-sm">{t("verifyText")}</span>
      <div className="flex flex-wrap gap-2">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@stadt.de" aria-label={t("officialEmail")} className={`${field.input} max-w-[320px]`} />
        <button type="button" disabled={pending || !email.includes("@")} onClick={() => start(async () => {
          const res = await startOfficialVerification(id, email, locale);
          setState(res.ok ? t("verifySent", { email }) : tc(`errors.${res.error}` as "errors.unknown"));
        })} className={btn.primary}>{t("sendLink")}</button>
      </div>
      {state && <p role="status" className="m-0 text-sm font-bold">{state}</p>}
    </div>
  );
}

function People({ onPick, label }: { onPick: (p: PersonHit) => void; label: string }) {
  const t = useTranslations("resprights.mine");
  return <PersonPicker filter={{ kind: "verified" }} label={label} placeholder={t("search")} onPick={onPick} />;
}

function HandOver({ r }: { r: MyResp }) {
  const t = useTranslations("resprights.mine");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (r.transfer_id) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm">
        {t("pending", { name: r.transfer_to ?? "?" })}
        <button type="button" disabled={pending} className={btn.linkMuted} onClick={() => start(async () => { await cancelTransfer(r.transfer_id!); router.refresh(); })}>{t("cancel")}</button>
      </span>
    );
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn.ghost}>{t("handOver")}</button>;
  return (
    <div className="flex flex-col gap-2 border border-line p-3">
      <span className="text-sm">{t("handOverText")}</span>
      <People label={t("send")} onPick={(p) => start(async () => {
        const res = await proposeTransfer(r.id, p.id);
        if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
        setOpen(false); router.refresh();
      })} />
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
    </div>
  );
}

function Substitute({ r }: { r: MyResp }) {
  const t = useTranslations("resprights.mine");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [person, setPerson] = useState<PersonHit | null>(null);
  const [until, setUntil] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (r.substitute_name) {
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm">
        {t("substituteNow", { name: r.substitute_name, date: r.substitute_until ? dateLong(r.substitute_until, locale) : "–" })}
        <button type="button" disabled={pending} className={btn.linkMuted} onClick={() => start(async () => { await clearSubstitute(r.id); router.refresh(); })}>{t("clearSubstitute")}</button>
      </span>
    );
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn.ghost}>{t("substitute")}</button>;
  return (
    <div className="flex flex-col gap-2 border border-line p-3">
      <span className="text-sm">{t("substituteText")}</span>
      {person ? <strong>{person.name}</strong> : <People label={t("substitute")} onPick={setPerson} />}
      <label className={field.label}>{t("until")}<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${field.input} max-w-[200px]`} /></label>
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
      <span className="flex gap-2">
        <button type="button" disabled={pending || !person || !until} className={btn.primary} onClick={() => start(async () => {
          const res = await setSubstitute(r.id, person!.id, until);
          if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
          setOpen(false); router.refresh();
        })}>{t("setSubstitute")}</button>
        <button type="button" onClick={() => setOpen(false)} className={btn.secondary}>{tc("cancel")}</button>
      </span>
    </div>
  );
}

function Incoming({ items }: { items: { id: string; title: string; by: string }[] }) {
  const t = useTranslations("resprights.mine");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const tc = useTranslations("common");
  return (
    <>
      {items.map((x) => (
        <div key={x.id} role="status" className="flex flex-col gap-2 border-2 border-ink bg-surface p-4">
          <strong>{t("transferTitle", { by: x.by, title: x.title })}</strong>
          <span className="flex gap-2">
            <button type="button" disabled={pending} className={btn.primary} onClick={() => start(async () => {
              const res = await decideTransfer(x.id, true);
              if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
              router.refresh();
            })}>{t("accept")}</button>
            <button type="button" disabled={pending} className={btn.secondary} onClick={() => start(async () => { await decideTransfer(x.id, false); router.refresh(); })}>{t("decline")}</button>
          </span>
        </div>
      ))}
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
    </>
  );
}

export function Responsibilities({ items, homeRegion, incoming, substituting }: {
  items: MyResp[]; homeRegion: { id: string; name: string } | null; incoming: { id: string; title: string; by: string }[]; substituting: { id: string; title: string; until: string | null }[];
}) {
  const t = useTranslations("me.resp");
  const tr = useTranslations("resprights.mine");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <p className="m-0">{t("intro")}</p>
      <Incoming items={incoming} />
      {substituting.map((x) => (
        <span key={x.id} className="flex flex-wrap items-center gap-2 text-sm">
          {tr("substituting", { title: x.title, date: x.until ? dateLong(x.until, locale) : "–" })}
          <button type="button" className={btn.linkMuted} onClick={() => start(async () => { await clearSubstitute(x.id); router.refresh(); })}>{tr("clearSubstitute")}</button>
        </span>
      ))}
      {items.length > 0 && <Link href="/responsible?view=intake" className="self-start font-bold">{t("openIntake")}</Link>}
      {items.map((r) => editing === r.id ? <Form key={r.id} initial={r} onDone={() => setEditing(null)} homeRegion={homeRegion} /> : (
        <article key={r.id} className="flex flex-col gap-2 border-t border-line pt-3">
          <strong className="flex flex-wrap items-center gap-2 text-lg">{r.organization_name ? `${r.organization_name} · ${r.title}` : r.title}
            <LevelBadge level={r.level} domain={r.official_domain} /></strong>
          <span>{r.description}</span>
          <span className="text-sm text-muted">{[r.region_name, r.tags.map((x) => `#${x}`).join(" "), r.open_requests ? t("openRequests", { n: r.open_requests }) : null].filter(Boolean).join(" · ")}</span>
          {r.state !== "active" && <Notice tone="warning" className="text-sm">{tr(`state_${r.state}` as "state_withdrawn")}</Notice>}
          {r.level === "self" && r.state === "active" && <span className="text-sm text-muted">{tr("confirmations", { n: r.confirm_count, min: r.confirm_min })}</span>}
          {r.dispute_id && <Link href={`/responsible/dispute/${r.dispute_id}`} className="text-sm font-bold text-red">{tr("dispute")}</Link>}
          {r.is_official && r.holders.length > 0 && <span className="text-sm text-muted">{tr("holders", { names: r.holders.join(", ") })}</span>}
          {r.is_official && r.reconfirm_due && <span className="text-sm">{tr("reconfirmDue", { date: dateLong(r.reconfirm_due, locale) })}</span>}
          <div className="flex flex-wrap items-start gap-2">
            {r.is_primary && (!r.is_official || r.state !== "active") && <Verify id={r.id} />}
            {r.is_official && r.state === "active" && <Verify id={r.id} label={tr("reconfirm")} />}
            {r.is_official && r.state === "active" && <Verify id={r.id} label={tr("joinOfficial")} />}
            {r.is_primary && <button type="button" onClick={() => setEditing(r.id)} className={btn.ghost}>{tc("edit")}</button>}
            {r.is_primary && !r.is_official && r.state === "active" && <HandOver r={r} />}
            {r.state === "active" && <Substitute r={r} />}
            {!r.is_primary || r.holders.length > 1 ? (
              <ConfirmAction disabled={pending} look={btn.ghost} question={tr("leaveConfirm")} onConfirm={() => start(async () => { const res = await leaveResponsibility(r.id); setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown")); router.refresh(); })} label={tr("leave")} />
            ) : null}
            {r.is_primary && <ConfirmAction disabled={pending} look={btn.ghost} question={t("deleteConfirm")} onConfirm={() => start(async () => { await deleteResponsibility(r.id); })} label={tc("delete")} />}
          </div>
          {r.history.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">{tr("history")}</summary>
              <ul className="m-0 mt-1 list-none p-0">
                {r.history.map((h, i) => <li key={i}>{tr(`historyKind.${h.kind}` as "historyKind.created")}{h.name ? ` · ${h.name}` : ""} · {relTime(h.at, locale)}</li>)}
              </ul>
            </details>
          )}
        </article>
      ))}
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
      {adding ? <Form onDone={() => setAdding(false)} homeRegion={homeRegion} /> : <button type="button" onClick={() => setAdding(true)} className={`${btn.secondary} self-start border-ink`}>+ {t("add")}</button>}
    </div>
  );
}
