"use client";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { deleteExpense, saveExpense } from "@/lib/actions/expenses";
import type { Balance, ExpenseBook, ExpenseMember, ExpenseView, Settlement } from "@/lib/expenses";
import { money } from "@/lib/format";
import { CATEGORIES, CURRENCIES, parseAmount, parseNumber, splitCents, SPLITS, type Category, type Split } from "@/lib/split";
import { uploadAttachment } from "@/lib/upload";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { FILE_BUCKET, formatSize, isImage, type UploadedFile } from "@/lib/files";
import { Attachments } from "../Attachments";
import { Avatar } from "../ui/Avatar";
import { ConfirmAction, useAction } from "../ui/Action";
import { Dialog } from "../ui/Dialog";
import { Notice, Section } from "../ui/Page";
import { IconAttach, IconCar, IconCart, IconClose, IconFile, IconFood, IconHome, IconPlane, IconPlus, IconReceipt, IconSwap, IconTicket } from "../ui/Icons";
import { btn, field, segment, segments } from "../ui/styles";

const ICONS: Record<Category, (p: { size?: number }) => ReactNode> = {
  general: IconReceipt, food: IconFood, groceries: IconCart, home: IconHome, transport: IconCar, travel: IconPlane, fun: IconTicket,
};
const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_RECEIPTS = 6;

/** Today on this device, as the date field wants it. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** A calendar day ("2026-03-22") read as that day everywhere, without a time zone shifting it. */
const day = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmtDay = (s: string, locale: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o }).format(day(s));
/** Cents as the form shows them ("12,50"). */
const amountText = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(cents / 100);

type SettleDraft = { from: string; to: string; amount: number; currency: string };

/**
 * Ausgaben teilen: who paid what for whom, the balances and who pays whom to even out (like Splitwise).
 * The platform only keeps the book; money moves outside of it.
 */
export function Expenses({ slug, groupId, book, me, canWrite }: { slug: string; groupId: string; book: ExpenseBook; me: string; canWrite: boolean }) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const [form, setForm] = useState<{ entry?: ExpenseView } | null>(null);
  const [settle, setSettle] = useState<{ draft?: SettleDraft; entry?: ExpenseView } | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "balances">("list");
  const { run, pending, error } = useAction();
  const names = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of book.members) m.set(x.id, x.name);
    for (const b of book.balances) m.set(b.profile_id, b.name);
    for (const e of book.entries) { m.set(e.paid_by, e.payer_name); for (const s of e.shares) m.set(s.profile_id, s.name); }
    return m;
  }, [book]);
  const who = (id: string) => (id === me ? t("you") : names.get(id) ?? "?");
  const fmt = (cents: number, cur: string) => money(cents, cur, locale, { cents: true });

  const mine = book.balances.filter((b) => b.profile_id === me);
  const myMoves = book.settle.filter((s) => s.from === me || s.to === me);
  const live = book.entries.filter((e) => !e.deleted_at);
  const deleted = book.entries.filter((e) => e.deleted_at);
  const months: { key: string; label: string; items: ExpenseView[] }[] = [];
  for (const e of live) {
    const key = e.spent_on.slice(0, 7);
    if (months.at(-1)?.key !== key) months.push({ key, label: fmtDay(e.spent_on, locale, { month: "long", year: "numeric" }), items: [] });
    months.at(-1)!.items.push(e);
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <section aria-label={t("mine")} className="flex flex-col gap-1.5 border-t-[6px] border-ink pt-3">
        {mine.length === 0
          ? <strong className="text-xl md:text-2xl">{live.length ? t("settled") : t("emptyTitle")}</strong>
          : mine.map((b) => (
            <strong key={b.currency} className={`text-xl md:text-2xl ${b.net < 0 ? "text-red" : ""}`}>
              {b.net < 0 ? t("youOwe", { amount: fmt(-b.net, b.currency) }) : t("youGet", { amount: fmt(b.net, b.currency) })}
            </strong>
          ))}
        {myMoves.map((s, i) => (
          <span key={i} className="text-base">
            {s.from === me
              ? t.rich("youPay", { name: who(s.to), amount: fmt(s.amount, s.currency), b: (c) => <strong className="text-red">{c}</strong> })
              : t.rich("paysYou", { name: who(s.from), amount: fmt(s.amount, s.currency), b: (c) => <strong>{c}</strong> })}
          </span>
        ))}
        {!live.length && <span className="text-muted">{t("emptyText")}</span>}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {canWrite && <button type="button" onClick={() => setForm({})} className={btn.primary}><IconPlus size={16} /> {t("add")}</button>}
        {canWrite && book.settle.length > 0 && (
          <button type="button" onClick={() => setSettle({ draft: myMoves[0] ?? book.settle[0] })} className={btn.red}>{t("settleUp")}</button>
        )}
        {live.length > 0 && (
          <span role="group" aria-label={t("viewLabel")} className={`${segments} ml-auto`}>
            <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")} className={segment(view === "list")}>{t("viewList")}</button>
            <button type="button" aria-pressed={view === "balances"} onClick={() => setView("balances")} className={segment(view === "balances")}>{t("viewBalances")}</button>
          </span>
        )}
      </div>
      {error && <Notice tone="error">{error}</Notice>}

      {view === "balances" && (
        <Balances balances={book.balances} settle={book.settle} me={me} who={who} fmt={fmt} canWrite={canWrite}
          onSettle={(draft) => setSettle({ draft })} />
      )}

      {view === "list" && months.map((m) => (
        <section key={m.key} aria-label={m.label} className="flex flex-col">
          <h3 className="m-0 border-b-2 border-ink pb-2 text-base font-bold">{m.label}</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {m.items.map((e) => (
              <li key={e.id} id={`expense-${e.id}`} className="scroll-mt-24">
                <Row e={e} me={me} who={who} fmt={fmt} open={opened === e.id} onToggle={() => setOpened(opened === e.id ? null : e.id)} />
                {opened === e.id && (
                  <Detail e={e} me={me} fmt={fmt} canWrite={canWrite} pending={pending}
                    onEdit={() => (e.kind === "payment" ? setSettle({ entry: e }) : setForm({ entry: e }))}
                    onDelete={() => run(() => deleteExpense(slug, e.id))} />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {view === "list" && deleted.length > 0 && (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-bold">{t("deleted", { n: deleted.length })}</summary>
          <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
            {deleted.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span className="line-through">{e.kind === "payment" ? t("paymentLine", { from: who(e.paid_by), to: who(e.shares[0]?.profile_id ?? ""), amount: fmt(e.amount_cents, e.currency) }) : `${e.title} · ${fmt(e.amount_cents, e.currency)}`}</span>
                <span className="text-muted">{t("deletedBy", { name: e.deleted_by_name ?? "?" })}</span>
                {canWrite && <button type="button" disabled={pending} onClick={() => run(() => deleteExpense(slug, e.id, true))} className={btn.link}>{t("restore")}</button>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {form && (
        <ExpenseForm slug={slug} groupId={groupId} me={me} members={book.members} currency={book.currency} entry={form.entry} onClose={() => setForm(null)} />
      )}
      {settle && (
        <SettleForm slug={slug} groupId={groupId} me={me} members={book.members} names={names} currency={book.currency}
          suggestions={book.settle} draft={settle.draft} entry={settle.entry} onClose={() => setSettle(null)} />
      )}
    </div>
  );
}

type Who = (id: string) => string;
type Fmt = (cents: number, currency: string) => string;

/** One line of the list: day, kind, title, who paid, and what it means for me. */
function Row({ e, me, who, fmt, open, onToggle }: { e: ExpenseView; me: string; who: Who; fmt: Fmt; open: boolean; onToggle: () => void }) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const Icon = e.kind === "payment" ? IconSwap : ICONS[e.category] ?? IconReceipt;
  const share = e.shares.find((s) => s.profile_id === me)?.amount_cents ?? 0;
  const effect = (e.paid_by === me ? e.amount_cents : 0) - share;
  const involved = e.paid_by === me || e.shares.some((s) => s.profile_id === me);
  const to = e.shares[0]?.profile_id ?? "";
  let mineLabel: ReactNode;
  if (!involved) mineLabel = <span className="text-sm text-muted">{t("notInvolved")}</span>;
  else if (effect === 0) mineLabel = <span className="text-sm text-muted">{t("even")}</span>;
  else {
    const label = e.kind === "payment" ? (effect > 0 ? t("youPaid") : t("youReceived")) : effect > 0 ? t("lent") : t("borrowed");
    mineLabel = (
      <span className={`flex flex-col items-end leading-tight ${effect < 0 ? "text-red" : ""}`}>
        <span className="text-xs">{label}</span>
        <strong className="text-base">{fmt(Math.abs(effect), e.currency)}</strong>
      </span>
    );
  }
  return (
    <button type="button" onClick={onToggle} aria-expanded={open}
      className={`flex w-full cursor-pointer items-center gap-3 border-0 border-b border-line px-1 py-3 text-left text-ink ${open ? "bg-surface" : "bg-transparent"}`}>
      <span className="flex w-9 flex-none flex-col items-center leading-tight">
        <span className="text-xs text-muted">{fmtDay(e.spent_on, locale, { month: "short" })}</span>
        <span className="text-lg">{fmtDay(e.spent_on, locale, { day: "2-digit" })}</span>
      </span>
      <span className={`flex h-11 w-11 flex-none items-center justify-center border ${e.kind === "payment" ? "border-ink" : "border-line bg-chip"}`}><Icon size={22} /></span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5">
          <strong className="truncate">{e.kind === "payment" ? t("paymentLine", { from: who(e.paid_by), to: who(to), amount: fmt(e.amount_cents, e.currency) }) : e.title}</strong>
          {e.files.length > 0 && <IconAttach size={14} className="flex-none text-muted" />}
        </span>
        {e.kind === "expense" && (
          <span className="truncate text-sm text-muted">{e.paid_by === me ? t("paidByYou", { amount: fmt(e.amount_cents, e.currency) }) : t("paidBy", { name: who(e.paid_by), amount: fmt(e.amount_cents, e.currency) })}</span>
        )}
      </span>
      <span className="flex-none text-right">{mineLabel}</span>
    </button>
  );
}

/** An opened entry: the parts of everyone, receipts, note, who wrote it down, and changing it. */
function Detail({ e, me, fmt, canWrite, pending, onEdit, onDelete }: {
  e: ExpenseView; me: string; fmt: Fmt; canWrite: boolean; pending: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const inputLabel = (input: number | null) =>
    input == null ? null : e.split === "percent" ? `${new Intl.NumberFormat(locale).format(input)} %` : e.split === "shares" ? t("sharesN", { n: input }) : null;
  return (
    <div className="flex flex-col gap-3 border-b border-line bg-surface px-4 py-4">
      <div className="flex flex-col gap-0.5">
        <strong className="text-2xl">{fmt(e.amount_cents, e.currency)}</strong>
        <span className="text-sm text-muted">
          {[fmtDay(e.spent_on, locale, { day: "numeric", month: "long", year: "numeric" }), e.kind === "expense" ? t(`split.${e.split}`) : null, e.kind === "expense" ? t(`categories.${e.category}`) : null].filter(Boolean).join(" · ")}
        </span>
      </div>
      {e.kind === "expense" && (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
          <li className="flex items-center gap-2 text-sm">
            <strong>{e.paid_by === me ? t("paidByYou", { amount: fmt(e.amount_cents, e.currency) }) : t("paidBy", { name: e.payer_name, amount: fmt(e.amount_cents, e.currency) })}</strong>
          </li>
          {e.shares.map((s) => (
            <li key={s.profile_id} className="flex items-center gap-2 text-sm">
              <Avatar name={s.name} seed={s.seed} path={s.path} size={24} />
              <span className="min-w-0 flex-1 truncate">{s.profile_id === me ? t("you") : s.name}{inputLabel(s.input) && <span className="text-muted"> · {inputLabel(s.input)}</span>}</span>
              <span>{t("owesPart", { amount: fmt(s.amount_cents, e.currency) })}</span>
            </li>
          ))}
        </ul>
      )}
      {e.note && <p className="m-0 whitespace-pre-line text-sm">{e.note}</p>}
      {e.files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">{t("receipts")}</span>
          <Attachments items={e.files} />
        </div>
      )}
      <span className="text-xs text-muted">
        {t("writtenBy", { name: e.created_by_name ?? "?" })}
        {e.updated_by_name && e.updated_at !== e.created_at && new Date(e.updated_at).getTime() - new Date(e.created_at).getTime() > 1000 ? ` · ${t("changedBy", { name: e.updated_by_name })}` : ""}
      </span>
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onEdit} className={btn.secondarySm}>{t("edit")}</button>
          <ConfirmAction label={t("delete")} question={t("deleteQuestion")} onConfirm={onDelete} size="sm" disabled={pending} />
        </div>
      )}
    </div>
  );
}

/** Everyone's balance and the fewest payments that even them out. */
function Balances({ balances, settle, me, who, fmt, canWrite, onSettle }: {
  balances: Balance[]; settle: Settlement[]; me: string; who: Who; fmt: Fmt; canWrite: boolean; onSettle: (d: SettleDraft) => void;
}) {
  const t = useTranslations("expenses");
  return (
    <div className="flex flex-col gap-6">
      <Section title={t("balances.title")}>
        {balances.length === 0 && <span className="text-muted">{t("balances.none")}</span>}
        <ul className="m-0 flex list-none flex-col p-0">
          {balances.map((b) => (
            <li key={`${b.currency}:${b.profile_id}`} className="flex items-center gap-3 border-b border-line py-2.5">
              <Avatar name={b.name} seed={b.seed} path={b.path} size={32} />
              <span className="min-w-0 flex-1 truncate">{b.profile_id === me ? t("you") : b.name}</span>
              <span className={b.net < 0 ? "text-red" : ""}>
                {t.rich(`balances.${b.net < 0 ? "owes" : "gets"}${b.profile_id === me ? "You" : ""}`, { amount: fmt(Math.abs(b.net), b.currency), b: (c) => <strong>{c}</strong> })}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      {settle.length > 0 && (
        <Section title={t("balances.settleTitle")}>
          <span className="text-sm text-muted">{t("balances.settleText")}</span>
          <ul className="m-0 flex list-none flex-col p-0">
            {settle.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5">
                <span className="min-w-0 flex-1">{t.rich("balances.move", { from: who(s.from), to: who(s.to), amount: fmt(s.amount, s.currency), b: (c) => <strong>{c}</strong> })}</span>
                {canWrite && <button type="button" onClick={() => onSettle(s)} className={btn.secondarySm}>{t("balances.record")}</button>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

/** Receipts on the form: photos and PDFs, uploaded into my folder at once and attached when the entry is saved. */
function useReceipts(kept: ExpenseView["files"]) {
  const t = useTranslations("extras");
  const [files, setFiles] = useState<(UploadedFile & { preview?: string })[]>([]);
  const [keep, setKeep] = useState(kept);
  const [removed, setRemoved] = useState<string[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const add = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    setError(null);
    const room = MAX_RECEIPTS - files.length - keep.length;
    if (picked.length > room) setError(t("errors.tooMany", { max: MAX_RECEIPTS }));
    for (const file of picked.slice(0, Math.max(0, room))) {
      if (file.type && !RECEIPT_TYPES.includes(file.type)) { setError(t("errors.type")); continue; }
      setUploading((n) => n + 1);
      const res = await uploadAttachment(file);
      setUploading((n) => n - 1);
      if (res.ok && RECEIPT_TYPES.includes(res.file.mime)) setFiles((f) => [...f, { ...res.file, preview: isImage(res.file.mime) ? URL.createObjectURL(file) : undefined }]);
      else if (res.ok) { setError(t("errors.type")); void createSupabaseBrowser().storage.from(FILE_BUCKET).remove([res.file.path]); }
      else setError(t(`errors.${res.error}`));
    }
  };
  const drop = (path: string) => {
    setFiles((f) => f.filter((x) => { if (x.path === path && x.preview) URL.revokeObjectURL(x.preview); return x.path !== path; }));
    void createSupabaseBrowser().storage.from(FILE_BUCKET).remove([path]);
  };
  const unkeep = (id: string) => { setKeep((k) => k.filter((x) => x.id !== id)); setRemoved((r) => [...r, id]); };
  /** Uploaded but never saved: the stored copies go again. */
  const discard = () => { if (files.length) void createSupabaseBrowser().storage.from(FILE_BUCKET).remove(files.map((f) => f.path)); };
  return { files, keep, removed, uploading, error, add, drop, unkeep, discard };
}

function ReceiptsField({ r }: { r: ReturnType<typeof useReceipts> }) {
  const t = useTranslations("expenses");
  const input = useRef<HTMLInputElement>(null);
  const count = r.files.length + r.keep.length;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold">{t("form.receipts")}</span>
      {(r.keep.length > 0 || r.files.length > 0) && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {r.keep.map((f) => (
            <li key={f.id} className="flex items-center gap-2 border border-line bg-surface py-1 pl-2 pr-1 text-sm">
              {isImage(f.mime)
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={`/api/files/${f.id}`} alt="" className="h-10 w-10 object-cover" />
                : <IconFile size={18} />}
              <span className="max-w-[140px] truncate">{f.name}</span>
              <button type="button" onClick={() => r.unkeep(f.id)} aria-label={t("form.removeReceipt", { name: f.name })} className="inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent text-ink"><IconClose size={14} /></button>
            </li>
          ))}
          {r.files.map((f) => (
            <li key={f.path} className="flex items-center gap-2 border border-line bg-surface py-1 pl-2 pr-1 text-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {f.preview ? <img src={f.preview} alt="" className="h-10 w-10 object-cover" /> : <IconFile size={18} />}
              <span className="flex min-w-0 flex-col"><span className="max-w-[140px] truncate">{f.name}</span><span className="text-xs text-muted">{formatSize(f.size)}</span></span>
              <button type="button" onClick={() => r.drop(f.path)} aria-label={t("form.removeReceipt", { name: f.name })} className="inline-flex h-9 w-9 items-center justify-center border-0 bg-transparent text-ink"><IconClose size={14} /></button>
            </li>
          ))}
        </ul>
      )}
      {count < MAX_RECEIPTS && (
        <span className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => input.current?.click()} disabled={r.uploading > 0} className={btn.secondarySm}>
            <IconAttach size={16} /> {r.uploading ? t("form.uploading") : t("form.addReceipt")}
          </button>
          <span className={field.hint}>{t("form.receiptHint")}</span>
        </span>
      )}
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => { void r.add(e.target.files); e.target.value = ""; }} />
      {r.error && <span role="alert" className="text-sm font-bold">{r.error}</span>}
    </div>
  );
}

/** A new expense or a change: what, how much, when, who paid, who shares it and how. */
function ExpenseForm({ slug, groupId, me, members, currency, entry, onClose }: {
  slug: string; groupId: string; me: string; members: ExpenseMember[]; currency: string; entry?: ExpenseView; onClose: () => void;
}) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const { run, pending, error } = useAction();
  // Everyone in the group, and people on this entry who have left it since.
  const people: ExpenseMember[] = useMemo(() => {
    const list = [...members];
    for (const s of entry?.shares ?? []) if (!list.some((m) => m.id === s.profile_id)) list.push({ id: s.profile_id, name: s.name, seed: s.seed, path: s.path });
    return list;
  }, [members, entry]);
  const [title, setTitle] = useState(entry?.title ?? "");
  const [amount, setAmount] = useState(entry ? amountText(entry.amount_cents, locale) : "");
  const [cur, setCur] = useState(entry?.currency ?? currency);
  const [spentOn, setSpentOn] = useState(entry?.spent_on ?? today());
  const [category, setCategory] = useState<Category>(entry?.category ?? "general");
  const [paidBy, setPaidBy] = useState(entry?.paid_by ?? me);
  const [split, setSplit] = useState<Split>(entry?.split ?? "equal");
  const [on, setOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(people.map((p) => [p.id, entry ? entry.shares.some((s) => s.profile_id === p.id) : true])));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((entry?.shares ?? []).map((s) => [s.profile_id,
    s.input == null ? "" : entry!.split === "exact" ? amountText(Number(s.input), locale) : new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 4 }).format(Number(s.input))])));
  const [note, setNote] = useState(entry?.note ?? "");
  const receipts = useReceipts(entry?.files ?? []);

  const total = parseAmount(amount);
  const chosen = people.filter((p) => on[p.id]);
  const read = (id: string) => (split === "exact" ? parseAmount(values[id] ?? "") : parseNumber(values[id] ?? ""));
  const weights = chosen.map((p) => (split === "equal" ? 1 : read(p.id) ?? 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts: number[] = split === "exact" ? weights : split === "percent" && Math.abs(sum - 100) > 0.01 ? weights.map(() => 0) : splitCents(total ?? 0, weights);
  const fmt = (c: number) => money(c, cur, locale, { cents: true });
  let status: { ok: boolean; text: string } = { ok: true, text: "" };
  if (!chosen.length) status = { ok: false, text: t("form.nobody") };
  else if (split === "exact" && total) status = sum === total ? { ok: true, text: t("form.adds", { amount: fmt(total) }) } : sum < total ? { ok: false, text: t("form.left", { amount: fmt(total - sum) }) } : { ok: false, text: t("form.over", { amount: fmt(sum - total) }) };
  else if (split === "percent") status = Math.abs(sum - 100) <= 0.01 ? { ok: true, text: t("form.adds", { amount: "100 %" }) } : sum < 100 ? { ok: false, text: t("form.leftPct", { n: +(100 - sum).toFixed(2) }) } : { ok: false, text: t("form.overPct", { n: +(sum - 100).toFixed(2) }) };
  else if (split === "shares" && chosen.some((p) => !(read(p.id)! > 0))) status = { ok: false, text: t("form.sharesMissing") };
  const ready = !!title.trim() && !!total && total > 0 && status.ok && receipts.uploading === 0 && (split !== "exact" || chosen.every((p) => read(p.id) != null));

  // A new way of splitting starts filled in: equal parts, so only the differences need typing.
  const changeSplit = (next: Split) => {
    setSplit(next);
    const ids = people.filter((p) => on[p.id]).map((p) => p.id);
    if (next === "equal" || !ids.length) return;
    const even = splitCents(next === "percent" ? 10000 : total ?? 0, ids.map(() => 1));
    setValues(Object.fromEntries(ids.map((id, i) => [id, next === "shares" ? "1" : next === "percent" ? new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 2 }).format(even[i] / 100) : amountText(even[i], locale)])));
  };
  const close = () => { receipts.discard(); onClose(); };
  const submit = () => run(() => saveExpense(slug, {
    id: entry?.id, groupId, kind: "expense", title: title.trim(), amountCents: total ?? 0, currency: cur, paidBy, spentOn, split, category, note,
    shares: chosen.map((p, i) => ({ profileId: p.id, value: split === "equal" ? undefined : weights[i] })),
    files: receipts.files.map((f) => ({ path: f.path, name: f.name, mime: f.mime, size: f.size })), removeFiles: receipts.removed,
  }), { onOk: onClose });

  return (
    <Dialog title={entry ? t("form.editTitle") : t("form.title")} onClose={close} wide>
      <form className="flex flex-col gap-4" onSubmit={(ev) => { ev.preventDefault(); if (ready) submit(); }}>
        <label className={field.label}>{t("form.what")}
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder={t("form.whatPlaceholder")} className={field.input} autoFocus={!entry} />
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className={field.label}>{t("form.amount")}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required placeholder="0,00" className={`${field.input} text-xl font-bold`} />
          </label>
          <label className={field.label}>{t("form.currency")}
            <select value={cur} onChange={(e) => setCur(e.target.value)} className={field.select}>
              {[...new Set([cur, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={`${field.label} col-span-2 sm:col-span-1`}>{t("form.date")}
            <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} required className={field.input} />
          </label>
        </div>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-sm font-bold">{t("form.category")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => {
              const Icon = ICONS[c];
              return (
                <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} title={t(`categories.${c}`)}
                  className={`inline-flex h-9 items-center gap-1.5 border px-2.5 text-sm ${category === c ? "border-ink bg-ink font-bold text-on-ink" : "border-line-strong bg-surface text-ink"}`}>
                  <Icon size={16} /> <span className="max-sm:sr-only">{t(`categories.${c}`)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className={field.label}>{t("form.paidBy")}
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className={field.select}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.id === me ? t("you") : p.name}</option>)}
          </select>
        </label>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-sm font-bold">{t("form.split")}</legend>
          <span role="group" className={`${segments} flex-wrap`}>
            {SPLITS.map((s) => <button key={s} type="button" aria-pressed={split === s} onClick={() => changeSplit(s)} className={segment(split === s)}>{t(`splitShort.${s}`)}</button>)}
          </span>
          <span className={field.hint}>{t(`splitHint.${split}`)}</span>
          <ul className="m-0 flex list-none flex-col border-t border-line p-0">
            {people.map((p) => {
              const i = chosen.findIndex((c) => c.id === p.id);
              return (
                <li key={p.id} className="flex min-h-[52px] items-center gap-3 border-b border-line py-1.5">
                  <input type="checkbox" checked={!!on[p.id]} onChange={(e) => setOn({ ...on, [p.id]: e.target.checked })} aria-label={t("form.takesPart", { name: p.name })}
                    className="h-5 w-5 flex-none accent-[var(--ink)]" />
                  <Avatar name={p.name} seed={p.seed} path={p.path} size={28} />
                  <span className={`min-w-0 flex-1 truncate ${on[p.id] ? "" : "text-muted"}`}>{p.id === me ? t("you") : p.name}</span>
                  {on[p.id] && split !== "equal" && (
                    <span className="flex items-center gap-1">
                      <input value={values[p.id] ?? ""} onChange={(e) => setValues({ ...values, [p.id]: e.target.value })} inputMode="decimal"
                        aria-label={t(`form.valueLabel.${split}`, { name: p.name })} className={`${field.input} h-9 w-20 text-right`} />
                      <span className="w-8 text-sm text-muted">{split === "percent" ? "%" : split === "shares" ? "×" : cur}</span>
                    </span>
                  )}
                  {on[p.id] && split !== "exact" && <span className="w-24 flex-none text-right text-sm font-bold">{total && i >= 0 ? fmt(parts[i]) : "–"}</span>}
                </li>
              );
            })}
          </ul>
          {status.text && <span role="status" className={`text-sm ${status.ok ? "text-muted" : "font-bold text-red"}`}>{status.text}</span>}
        </fieldset>
        <ReceiptsField r={receipts} />
        <label className={field.label}>{t("form.note")}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={2} className={field.textarea} />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <span className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !ready} className={btn.primary}>{pending ? t("form.saving") : t("form.save")}</button>
          <button type="button" onClick={close} className={btn.secondary}>{t("form.cancel")}</button>
        </span>
      </form>
    </Dialog>
  );
}

/** Settling up: a payment from one person to another, suggested from the balances. */
function SettleForm({ slug, groupId, me, members, names, currency, suggestions, draft, entry, onClose }: {
  slug: string; groupId: string; me: string; members: ExpenseMember[]; names: Map<string, string>; currency: string;
  suggestions: Settlement[]; draft?: SettleDraft; entry?: ExpenseView; onClose: () => void;
}) {
  const t = useTranslations("expenses");
  const locale = useLocale();
  const { run, pending, error } = useAction();
  const start = entry ? { from: entry.paid_by, to: entry.shares[0]?.profile_id ?? "", amount: entry.amount_cents, currency: entry.currency } : draft;
  const [from, setFrom] = useState(start?.from ?? me);
  const [to, setTo] = useState(start?.to ?? members.find((m) => m.id !== me)?.id ?? "");
  const [amount, setAmount] = useState(start ? amountText(start.amount, locale) : "");
  const [cur, setCur] = useState(start?.currency ?? currency);
  const [spentOn, setSpentOn] = useState(entry?.spent_on ?? today());
  const people = [...members];
  for (const id of [from, to]) if (id && !people.some((p) => p.id === id)) people.push({ id, name: names.get(id) ?? "?", seed: 0, path: null });
  const name = (id: string) => (id === me ? t("you") : names.get(id) ?? "?");
  const total = parseAmount(amount);
  const ready = !!total && total > 0 && !!to && from !== to;
  const pick = (s: Settlement) => { setFrom(s.from); setTo(s.to); setAmount(amountText(s.amount, locale)); setCur(s.currency); };
  return (
    <Dialog title={entry ? t("settle.editTitle") : t("settle.title")} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={(ev) => {
        ev.preventDefault();
        if (ready) run(() => saveExpense(slug, {
          id: entry?.id, groupId, kind: "payment", title: t("settle.entryTitle"), amountCents: total!, currency: cur, paidBy: from, spentOn,
          split: "exact", category: "general", note: "", shares: [{ profileId: to, value: total! }], files: [], removeFiles: [],
        }), { onOk: onClose });
      }}>
        {!entry && suggestions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{t("settle.suggested")}</span>
            {suggestions.map((s, i) => {
              const on = s.from === from && s.to === to && s.currency === cur && s.amount === total;
              return (
                <button key={i} type="button" aria-pressed={on} onClick={() => pick(s)}
                  className={`flex items-center justify-between gap-3 border px-3 py-2 text-left text-sm ${on ? "border-ink bg-paper font-bold" : "border-line-strong bg-surface"} text-ink`}>
                  <span>{t("settle.move", { from: name(s.from), to: name(s.to) })}</span>
                  <strong>{money(s.amount, s.currency, locale, { cents: true })}</strong>
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <label className={field.label}>{t("settle.from")}
            <select value={from} onChange={(e) => setFrom(e.target.value)} className={field.select}>
              {people.map((p) => <option key={p.id} value={p.id}>{name(p.id)}</option>)}
            </select>
          </label>
          <label className={field.label}>{t("settle.to")}
            <select value={to} onChange={(e) => setTo(e.target.value)} className={field.select}>
              {people.filter((p) => p.id !== from).map((p) => <option key={p.id} value={p.id}>{name(p.id)}</option>)}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className={field.label}>{t("form.amount")}
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" required placeholder="0,00" className={`${field.input} text-xl font-bold`} />
          </label>
          <label className={field.label}>{t("form.currency")}
            <select value={cur} onChange={(e) => setCur(e.target.value)} className={field.select}>
              {[...new Set([cur, ...CURRENCIES])].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className={`${field.label} col-span-2 sm:col-span-1`}>{t("form.date")}
            <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} required className={field.input} />
          </label>
        </div>
        <span className={field.hint}>{t("settle.hint")}</span>
        {error && <Notice tone="error">{error}</Notice>}
        <span className="flex flex-wrap gap-2">
          <button type="submit" disabled={pending || !ready} className={btn.red}>{pending ? t("form.saving") : t("settle.save")}</button>
          <button type="button" onClick={onClose} className={btn.secondary}>{t("form.cancel")}</button>
        </span>
      </form>
    </Dialog>
  );
}
