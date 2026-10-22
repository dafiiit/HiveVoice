"use client";
import { useState, useTransition } from "react";
import { useDraft } from "@/lib/drafts";
import { useTranslations } from "next-intl";
import { createRequest } from "@/lib/actions/responsible";
import { btn, field } from "../ui/styles";

export function RequestForm({ responsibilityId, name, projects }: { responsibilityId: string; name: string; projects: { id: string; title: string; kind: "initiative" | "group" }[] }) {
  const t = useTranslations("responsible");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [project, setProject] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const draft = useDraft(`request:${responsibilityId}`, body, (v) => { setBody(v); setOpen(true); });
  if (sent) return <span role="status" className="text-sm font-bold">{t("sent")}</span>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className={btn.primary}>{t("ask")}</button>;
  return (
    <div className="flex w-full flex-col gap-3 border-2 border-ink bg-surface p-4">
      <strong>{t("askTo", { name })}</strong>
      {projects.length > 0 && (
        <label className={field.label}>{t("project")}
          <select value={project} onChange={(e) => setProject(e.target.value)} className={field.select}>
            <option value="">{t("noProject")}</option>
            {projects.map((p) => <option key={p.id} value={`${p.kind}:${p.id}`}>{p.title}</option>)}
          </select>
        </label>
      )}
      <label className={field.label}>{t("concern")}<textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} className={field.textarea} /></label>
      <span className={field.hint}>{t("deadline")}</span>
      {error && <p role="alert" className="m-0 font-bold">{error}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={pending || body.trim().length < 10} onClick={() => start(async () => {
          const [kind, id] = project.split(":");
          const res = await createRequest({ responsibilityId, body, initiativeId: kind === "initiative" ? id : undefined, groupId: kind === "group" ? id : undefined });
          if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
          draft.clear();
          setSent(true);
        })} className={btn.primary}>{tc("send")}</button>
        <button type="button" onClick={() => setOpen(false)} className={btn.secondary}>{tc("cancel")}</button>
      </div>
    </div>
  );
}
