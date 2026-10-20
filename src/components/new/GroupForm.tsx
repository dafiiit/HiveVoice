"use client";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createGroup, similarGroups } from "@/lib/actions/groups";
import { TagPicker } from "../TagPicker";
import { RegionPicker } from "./RegionPicker";
import { btn, field, segment, segments } from "../ui/styles";

/** A choice shown as a small card (template, way of working): the chosen one is filled, like a chosen chip. */
const card = (on: boolean) => `flex flex-col items-start gap-1 p-3 text-left ${on ? "border border-ink bg-ink text-on-ink" : "border border-line-strong bg-surface text-ink"}`;
import { COMMUNITIES, type CommunityPreset } from "@/lib/communities";
import { Notice } from "@/components/ui/Page";

export function GroupForm({ chain, ideas }: { chain: { id: string; name: string; level: string }[]; ideas: string[] }) {
  const t = useTranslations("group.form");
  const tg = useTranslations("group");
  const tc = useTranslations("common");
  const tr = useTranslations("grouprights");
  const [template, setTemplate] = useState("project");
  const [adultsOnly, setAdultsOnly] = useState(false);
  const [similar, setSimilar] = useState<{ slug: string; name: string }[]>([]);
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
  const [preset, setPreset] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tp = useTranslations("group.presets");
  const apply = (c: CommunityPreset | null) => {
    setPreset(c?.key ?? null);
    if (!c) return;
    setKind(c.kind); setTemplate(c.template); setVisibility(c.visibility); setJoinPolicy(c.joinPolicy);
    setAdultsOnly(c.adultsOnly); setModTasks(c.modTasks); setTags(Array.from(new Set([...tags, ...c.tags])));
  };
  // While the name is typed: does a group like this exist already?
  useEffect(() => {
    const h = setTimeout(() => { similarGroups(name).then(setSimilar); }, 400);
    return () => clearTimeout(h);
  }, [name]);
  return (
    <form className="flex max-w-[720px] flex-col gap-6" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        const res = await createGroup({ name, summary, description, kind, visibility, joinPolicy, regionId: region?.id ?? "", modTasks, modOfficial: false, tags, focus, template, adultsOnly });
        if (res && !res.ok) setError(tc(`errors.${res.error}` as "errors.unknown"));
      });
    }}>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-bold">{tp("title")}</span>
        <span className={field.hint}>{tp("text")}</span>
        <div role="radiogroup" aria-label={tp("title")} className="grid gap-2 sm:grid-cols-2">
          {COMMUNITIES.map((c) => (
            <button key={c.key} type="button" role="radio" aria-checked={preset === c.key} onClick={() => apply(preset === c.key ? null : c)}
              className={card(preset === c.key)}>
              <strong>{tp(`items.${c.key}.name`)}</strong><span className="text-sm">{tp(`items.${c.key}.text`)}</span>
            </button>
          ))}
        </div>
      </div>
      <label className={field.label}>{t("name")}<input required minLength={3} value={name} onChange={(e) => setName(e.target.value)} className={field.input} /></label>
      {similar.length > 0 && (
        <Notice tone="status" className="text-sm font-normal">
          {tr("similar", { names: similar.map((s) => s.name).join(", ") })}{" "}
          {similar.map((s) => <a key={s.slug} href={`/groups/${s.slug}`} className="mr-2 font-bold">{s.name}</a>)}
        </Notice>
      )}
      <label className={field.label}>{t("summary")}<input value={summary} onChange={(e) => setSummary(e.target.value)} className={field.input} /></label>
      <label className={field.label}>{t("description")}<textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} className={field.textarea} /></label>
      <div className="flex flex-col gap-2"><span className="text-sm font-bold">{t("place")}</span><RegionPicker chain={chain} value={region} onChange={setRegion} /></div>
      <TagPicker label={t("tags")} value={tags} onChange={setTags} suggestions={ideas} />
      {/* Everything the template set, to change only if needed. */}
      <details className="group border-t border-line pt-4">
        <summary className="flex cursor-pointer list-none flex-col gap-1 [&::-webkit-details-marker]:hidden">
          <span className="font-bold"><span aria-hidden="true" className="mr-1.5 inline-block text-xs transition-transform group-open:rotate-90">▶</span>{t("settings")}</span>
          <span className="text-sm text-muted">{[tr(`template.${template as "project"}.name`), tg(`vis.${visibility as "public"}`), tg(`policy.${joinPolicy as "open"}`), adultsOnly ? tr("adultsOnly") : null].filter(Boolean).join(" · ")}</span>
        </summary>
        <div className="mt-4 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">{tr("template.title")}</span>
            <div role="radiogroup" aria-label={tr("template.title")} className="grid gap-2 md:grid-cols-3">
              {(["project", "club", "initiative"] as const).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={template === k} onClick={() => { setTemplate(k); setKind(k); }} className={card(template === k)}>
                  <strong>{tr(`template.${k}.name`)}</strong><span className="text-sm">{tr(`template.${k}.text`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">{tg("visibility")}</span>
            <div role="radiogroup" aria-label={tg("visibility")} className={segments}>{(["public", "members", "secret"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={visibility === v} onClick={() => setVisibility(v)} className={segment(visibility === v)}>{tg(`vis.${v}`)}</button>)}</div>
            <span className={field.hint}>{tr(`vis.${visibility}Text` as "vis.publicText")}</span>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-bold">{tg("joining")}</span>
            <div role="radiogroup" aria-label={tg("joining")} className={segments}>{(["open", "request", "invite"] as const).map((v) => <button key={v} type="button" role="radio" aria-checked={joinPolicy === v} onClick={() => setJoinPolicy(v)} className={segment(joinPolicy === v)}>{tg(`policy.${v}`)}</button>)}</div>
            <span className={field.hint}>{tr(`join.${joinPolicy}Text` as "join.openText")}</span>
          </div>
          <label className={field.label}>{t("focus")}<input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder={t("focusPlaceholder")} className={field.input} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={adultsOnly} onChange={() => setAdultsOnly(!adultsOnly)} className="h-5 w-5 accent-[var(--ink)]" />{tr("adultsOnly")}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={modTasks} onChange={() => setModTasks(!modTasks)} className="h-5 w-5 accent-[var(--ink)]" />{t("modTasks")}</label>
        </div>
      </details>
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={pending || name.trim().length < 3} className={`${btn.primary} self-start`}>{t("submit")}</button>
    </form>
  );
}
