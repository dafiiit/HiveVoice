"use client";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { addTodoItem, createTodoList, deleteTodoItem, deleteTodoList, setTodoItem, updateTodoList } from "@/lib/actions/todos";
import { IconClose, IconPlus } from "../ui/Icons";
import { btn, field } from "../ui/styles";
import { ConfirmAction } from "../ui/Action";

/** "Liste" next to "Dokument": opens a small form for the name, then goes to the new list. */
export function NewList({ label }: { label: string }) {
  const t = useTranslations("mine.list");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn.primarySm}><IconPlus size={14} /> {label}</button>;
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
      e.preventDefault();
      if (!title.trim()) return;
      start(async () => {
        const res = await createTodoList(title);
        if (res.ok) router.push(`/me/lists/${res.data}`);
        else setError(tc(`errors.${res.error}` as "errors.unknown"));
      });
    }}>
      <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label={t("titleLabel")} placeholder={t("titlePlaceholder")} className={`${field.input} w-64 max-w-full border-ink`} />
      <button type="submit" disabled={pending || !title.trim()} className={btn.primary}>{t("create")}</button>
      <button type="button" onClick={() => setOpen(false)} aria-label={t("cancel")} className="inline-flex h-11 w-11 items-center justify-center border-0 bg-transparent text-ink"><IconClose size={16} /></button>
      {error && <p role="alert" className="m-0 w-full text-sm font-bold">{error}</p>}
    </form>
  );
}

type Item = { id: string; title: string; done: boolean };
type Change = { type: "add"; item: Item } | { type: "set"; id: string; done: boolean } | { type: "remove"; id: string };

/** `editable`: may tick and add items; `owner`: may also rename, share and delete. `share` is the Teilen button (server-rendered). */
export function TodoList({ id, title, items, editable, owner, share }: { id: string; title: string; items: Item[]; editable: boolean; owner: boolean; share?: React.ReactNode }) {
  const t = useTranslations("mine.list");
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, change] = useOptimistic(items, (all: Item[], c: Change) =>
    c.type === "add" ? [...all, c.item] : c.type === "set" ? all.map((x) => (x.id === c.id ? { ...x, done: c.done } : x)) : all.filter((x) => x.id !== c.id));
  const [draft, setDraft] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, optimistic?: Change) => start(async () => {
    if (optimistic) change(optimistic);
    const res = await fn().catch(() => ({ ok: false, error: "unknown" }));
    setError(res.ok ? null : tc(`errors.${res.error}` as "errors.unknown"));
    router.refresh();
  });

  const open = shown.filter((x) => !x.done);
  const closed = shown.filter((x) => x.done);
  const row = (x: Item) => (
    <li key={x.id} className="flex min-h-12 items-center gap-3 border-b border-line">
      <input type="checkbox" checked={x.done} disabled={!editable || x.id.startsWith("tmp-")} aria-label={x.title} className="h-5 w-5 flex-none accent-[var(--ink)]"
        onChange={(e) => act(() => setTodoItem(id, x.id, { done: e.target.checked }), { type: "set", id: x.id, done: e.target.checked })} />
      <span className={`min-w-0 flex-1 break-words ${x.done ? "text-muted line-through" : ""}`}>{x.title}</span>
      {editable && !x.id.startsWith("tmp-") && (
        <button type="button" aria-label={`${t("remove")}: ${x.title}`} onClick={() => act(() => deleteTodoItem(id, x.id), { type: "remove", id: x.id })}
          className="inline-flex h-10 w-10 flex-none items-center justify-center border-0 bg-transparent text-muted hover:text-ink"><IconClose size={14} /></button>
      )}
    </li>
  );

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      {renaming !== null ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (renaming.trim()) act(() => updateTodoList(id, { title: renaming })); setRenaming(null); }}>
          <input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={200} aria-label={t("titleLabel")} className={`${field.input} max-w-md`} />
          <button type="submit" className={btn.primarySm}>{t("save")}</button>
          <button type="button" onClick={() => setRenaming(null)} className={btn.secondarySm}>{t("cancel")}</button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h1 className="m-0 min-w-0 break-words text-[28px] font-bold leading-tight">{title}</h1>
          {owner && (
            <div className="flex flex-wrap items-center gap-2">
              {share}
              <button type="button" disabled={pending} onClick={() => setRenaming(title)} className={btn.secondarySm}>{t("rename")}</button>
              <ConfirmAction disabled={pending} size="sm" question={t("deleteConfirm")} label={t("delete")}
                onConfirm={() => start(async () => { const res = await deleteTodoList(id); if (res.ok) router.push("/me/lists"); })} />
            </div>
          )}
        </div>
      )}

      {editable && (
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft("");
          act(() => addTodoItem(id, text), { type: "add", item: { id: `tmp-${Date.now()}`, title: text, done: false } });
          input.current?.focus();
        }}>
          <input ref={input} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder={t("addPlaceholder")} aria-label={t("addLabel")} className={`${field.input} min-w-0 flex-1 border-ink`} />
          <button type="submit" disabled={!draft.trim()} className={btn.primary}>{t("add")}</button>
        </form>
      )}

      <ul className="m-0 flex list-none flex-col border-t border-line p-0">
        {open.map(row)}
        {shown.length === 0 && <li className="py-4 text-muted">{t("empty")}</li>}
      </ul>
      {closed.length > 0 && (
        <section className="flex flex-col gap-1">
          <h2 className="m-0 text-sm font-bold">{t("done")} · {closed.length}</h2>
          <ul className="m-0 flex list-none flex-col border-t border-line p-0">{closed.map(row)}</ul>
        </section>
      )}
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}

    </div>
  );
}
