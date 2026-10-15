"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createGroup } from "@/lib/actions/groups";
import { TagPicker } from "../TagPicker";
import { RegionPicker } from "./RegionPicker";
import { btn, chip, field } from "../ui/styles";

export function GroupForm({ chain }: { chain: { id: string; name: string; level: string }[] }) {
  const t = useTranslations("group.form");
  const tg = useTranslations("group");
  const tc = useTranslations("common");
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("project");
  const [visibility, setVisibility] = useState("public");
  const [joinPolicy, setJoinPolicy] = useState("request");
  const [region, setRegion] = useState(chain.find((r) => r.level === "municipality") ?? chain[0] ?? null);
  const [tags, setTags] = useState<string[]>([]);
  const [focus, setFocus] = useState("");
  const [modTasks, setModTasks] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="flex max-w-[760px] flex-col gap-6" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const res = await createGroup({ name, summary, description, kind, visibility, joinPolicy, regionId: region?.id ?? "", modTasks, modOfficial: false, tags, focus });
        if (res && !res.ok) setError(tc(`errors.${res.error}` as "errors.unknown"));
      });
    }}>
      <label className={field.label}>{t("name")}<input required minLength={3} value={name} onChange={(e) => setName(e.target.value)} className={field.input} /></label>
      <label className={field.label}>{t("summary")}<input value={summary} onChange={(e) => setSummary(e.target.value)} className={field.input} /></label>
      <label className={field.label}>{t("description")}<textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} className={field.textarea} /></label>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">{t("kind")}</span>
        <div role="radiogroup" aria-label={t("kind")} className="flex flex-wrap gap-2">
          {(["project", "club", "initiative", "community", "other"] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>{tg(`kinds.${k}`)}</button>)}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">{tg("visibility")}</span>
        <div className="flex flex-wrap gap-2">{(["public", "members"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={visibility === v} onClick={() => setVisibility(v)} className={chip(visibility === v)}>{tg(`vis.${v}`)}</button>)}</div>
        <span className={field.hint}>{tg(`visText.${visibility}`)}</span>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">{tg("joining")}</span>
        <div className="flex flex-wrap gap-2">{(["open", "request"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={joinPolicy === v} onClick={() => setJoinPolicy(v)} className={chip(joinPolicy === v)}>{tg(`policy.${v}`)}</button>)}</div>
        <span className={field.hint}>{tg(`policyText.${joinPolicy}`)}</span>
      </div>
      <div className="flex flex-col gap-2"><span className="text-sm font-bold">{t("place")}</span><RegionPicker chain={chain} value={region} onChange={setRegion} /></div>
      <TagPicker label={t("tags")} value={tags} onChange={setTags} suggestions={["sport", "musik", "garten", "film", "verkehr", "umwelt", "bildung", "nachbarschaft"]} />
      <label className={field.label}>{t("focus")}<input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder={t("focusPlaceholder")} className={field.inputSm} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={modTasks} onChange={() => setModTasks(!modTasks)} className="h-5 w-5 accent-[var(--ink)]" />{t("modTasks")}</label>
      {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
      <button type="submit" disabled={pending || name.trim().length < 3} className={`${btn.primaryLg} self-start`}>{t("submit")}</button>
    </form>
  );
}
