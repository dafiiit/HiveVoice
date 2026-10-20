"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addTask, claimTask, deleteTask, moveTask } from "@/lib/actions/groups";
import { euro } from "@/lib/format";
import { Avatar } from "../ui/Avatar";
import { btn, field } from "../ui/styles";
import { ShareMenu } from "../refs/ShareMenu";
import { AccessPanel } from "../refs/AccessPanel";
import type { AccessGrant, Scope } from "@/lib/actions/share";

export type TaskView = {
  id: string; title: string; status: "open" | "in_progress" | "done"; hourly_rate_cents: number | null; assignees: { id: string; name: string; seed: number }[];
  /** Rights of this task: who reads and edits it, set by its creator or the group's admins. */
  read_scope: Scope; write_scope: Scope; can_write: boolean; manage: boolean; link_token: string | null; grants: AccessGrant[];
};
const COLS = ["open", "in_progress", "done"] as const;

export function Tasks({ slug, groupId, tasks, canEdit, viewerId, signedIn }: { slug: string; groupId: string; tasks: TaskView[]; canEdit: boolean; viewerId?: string; signedIn: boolean }) {
  const t = useTranslations("group.tasks");
  const locale = useLocale();
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-5">
      {canEdit && (
        <form className="flex max-w-[520px] gap-2" onSubmit={(e) => { e.preventDefault(); if (title.trim()) start(async () => { await addTask(slug, groupId, title); setTitle(""); }); }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("new")} aria-label={t("new")} className={field.inputSm} />
          <button type="submit" disabled={pending} className={btn.primary}>+</button>
        </form>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {COLS.map((c) => {
          const items = tasks.filter((x) => x.status === c);
          return (
            <section key={c} aria-label={t(c)} className="flex flex-col gap-3">
              <strong className="border-b-2 border-ink pb-2">{t(c)} · {items.length}</strong>
              {items.map((x) => {
                const mine = x.assignees.some((a) => a.id === viewerId);
                return (
                  <article key={x.id} id={`task-${x.id}`} className="flex scroll-mt-24 flex-col gap-2 border border-line bg-surface p-3">
                    <span className={`font-bold ${c === "done" ? "line-through" : ""}`}>{x.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      {x.assignees.length ? x.assignees.map((a) => <span key={a.id} className="inline-flex items-center gap-1"><Avatar name={a.name} seed={a.seed} size={20} />{a.name}</span>) : <span className="text-muted">{t("unassigned")}</span>}
                      <span className="text-muted">· {x.hourly_rate_cents ? `${euro(x.hourly_rate_cents, locale)}/h` : t("volunteer")}</span>
                    </span>
                    {x.can_write && (
                      <div className="flex flex-wrap gap-3 text-sm">
                        {c !== "done" && <button type="button" disabled={pending} onClick={() => start(async () => { await moveTask(slug, x.id, c === "open" ? "in_progress" : "done"); })} className="border-0 bg-transparent p-0 font-bold text-ink underline">{c === "open" ? t("start") : t("finish")}</button>}
                        {c === "done" && <button type="button" disabled={pending} onClick={() => start(async () => { await moveTask(slug, x.id, "open"); })} className="border-0 bg-transparent p-0 text-muted underline">{t("reopen")}</button>}
                        <button type="button" disabled={pending} onClick={() => start(async () => { await claimTask(slug, x.id, !mine); })} className="border-0 bg-transparent p-0 text-muted underline">{mine ? t("unclaim") : t("claim")}</button>
                        <button type="button" disabled={pending} onClick={() => start(async () => { await deleteTask(slug, x.id); })} className="border-0 bg-transparent p-0 text-muted underline">{t("delete")}</button>
                      </div>
                    )}
                    {signedIn && <ShareMenu type="task" id={x.id} title={x.title} className="self-start border-0 bg-transparent p-0 text-sm font-bold text-ink underline" />}
                    {x.manage && (
                      <AccessPanel type="task" id={x.id} read={x.read_scope} write={x.write_scope} hasGroup grants={x.grants} path={`/groups/${slug}`}
                        linkUrl={x.link_token ? `/r/task/${x.id}?k=${x.link_token}` : null} />
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
    </div>
  );
}
