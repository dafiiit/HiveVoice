"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { addTask, blocks, moveTask, removeLine, setTaskText, taskCount, toggleTask } from "./tasks";
import { IconClose } from "../ui/Icons";
import { btn, field } from "../ui/styles";

/**
 * A note seen as a list: the headings are groups, the lines with "- [ ]" are the items. Everything done here changes the
 * text of the note itself (the Markdown stays the only truth), so the same note can be shown as text or as a list at any time.
 */
export function TaskView({ body, onChange, readOnly }: { body: string; onChange: (body: string) => void; readOnly: boolean }) {
  const t = useTranslations("mine.list");
  const [draft, setDraft] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const all = blocks(body);
  const { total, done } = taskCount(body);
  const lastHeading = [...all].reverse().find((b) => b.type === "heading");
  const groups = all.filter((b) => b.type === "heading").length;

  return (
    <div className="flex flex-col gap-4 border border-line-strong bg-surface p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-sm font-bold" aria-live="polite">{total ? t("progress", { done, total }) : t("empty")}</span>
        {done > 0 && (
          <label className="flex min-h-9 items-center gap-2 text-sm">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="h-4 w-4 accent-[var(--ink)]" /> {t("hideDone")}
          </label>
        )}
      </div>
      {total > 0 && (
        <div className="h-1.5 w-full bg-chip" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={t("progress", { done, total })}>
          <div className="h-full bg-ink" style={{ width: `${Math.round((done / total) * 100)}%` }} />
        </div>
      )}

      {!readOnly && (
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          const text = draft.trim();
          if (!text) return;
          setDraft("");
          onChange(addTask(body, text, groups ? lastHeading?.line : undefined));
        }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={500} placeholder={t("addPlaceholder")} aria-label={t("addLabel")} className={`${field.input} min-w-0 flex-1 border-ink`} />
          <button type="submit" disabled={!draft.trim()} className={btn.primary}>{t("add")}</button>
        </form>
      )}

      <ul className="m-0 flex list-none flex-col p-0">
        {all.map((b) => {
          if (b.type === "heading") return <li key={b.line} className="mt-4 border-b-2 border-ink pb-1 text-lg font-bold first:mt-0">{b.text}</li>;
          if (b.type === "text") return <li key={b.line} className="py-1 text-sm text-muted">{b.text}</li>;
          if (hideDone && b.done) return null;
          return (
            <li key={b.line} className="flex min-h-12 items-center gap-1 border-b border-line" style={{ paddingLeft: `${b.indent * 1.5}rem` }}>
              <button type="button" role="checkbox" aria-checked={b.done} aria-label={b.text} disabled={readOnly} onClick={() => onChange(toggleTask(body, b.line))}
                className="inline-flex h-11 w-11 flex-none items-center justify-center border-0 bg-transparent p-0 disabled:cursor-default">
                <span className={`inline-flex h-5 w-5 items-center justify-center border-2 border-ink ${b.done ? "bg-ink text-on-ink" : "bg-surface"}`}>{b.done && <span className="text-xs leading-none">✓</span>}</span>
              </button>
              {readOnly
                ? <span className={`min-w-0 flex-1 break-words ${b.done ? "text-muted line-through" : ""}`}>{b.text}</span>
                : <input key={`${b.line}:${b.text}`} defaultValue={b.text} maxLength={500} aria-label={t("itemLabel")}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== b.text) onChange(setTaskText(body, b.line, v)); else e.target.value = b.text; }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    className={`min-h-11 min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink ${b.done ? "text-muted line-through" : ""}`} />}
              {!readOnly && (
                <span className="flex flex-none items-center">
                  <button type="button" aria-label={`${t("up")}: ${b.text}`} onClick={() => onChange(moveTask(body, b.line, -1))} className="inline-flex h-11 w-9 items-center justify-center border-0 bg-transparent text-muted hover:text-ink">↑</button>
                  <button type="button" aria-label={`${t("down")}: ${b.text}`} onClick={() => onChange(moveTask(body, b.line, 1))} className="inline-flex h-11 w-9 items-center justify-center border-0 bg-transparent text-muted hover:text-ink">↓</button>
                  <button type="button" aria-label={`${t("remove")}: ${b.text}`} onClick={() => onChange(removeLine(body, b.line))} className="inline-flex h-11 w-11 items-center justify-center border-0 bg-transparent text-muted hover:text-ink"><IconClose size={14} /></button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
