"use client";
import { useState, useTransition } from "react";
import { useDraft } from "@/lib/drafts";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { previewLink, shareLink } from "@/lib/actions/links";
import type { Inspection } from "@/lib/links/inspect";
import { TagPicker } from "../TagPicker";
import { PreviewImage } from "./PreviewImage";
import { IconCheck } from "../ui/Icons";
import { btn, cardFrame, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

type Group = { id: string; slug: string; name: string };
type Good = Extract<Inspection, { ok: true }>;

/** Two steps: check the link and show what it is, then add title, words to find it, and where to share it. */
export function ShareLinkForm({ groups, initialGroup, ideas }: { groups: Group[]; initialGroup: string | null; ideas: string[] }) {
  const t = useTranslations("links");
  const tc = useTranslations("common");
  const router = useRouter();
  // Inside Ich the document opens next to its list, elsewhere on its own page.
  const here = usePathname();
  const docHref = (id: string) => (here.startsWith("/me/") ? `/me/uploads/${id}` : `/links/${id}`);
  const [url, setUrl] = useState("");
  const [found, setFound] = useState<Good | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string>(groups.find((g) => g.slug === initialGroup)?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // A link begun but not shared stays on the device (it is checked again before sharing).
  const draft = useDraft("link:new", { url, title, description, tags }, (v) => { setUrl(v.url); setTitle(v.title); setDescription(v.description); setTags(v.tags); });

  async function check(e?: React.FormEvent) {
    e?.preventDefault();
    if (!url.trim()) return;
    setChecking(true);
    setBlocked(null);
    setError(null);
    setFound(null);
    const res = await previewLink(url);
    setChecking(false);
    if (!res.ok) return setError(tc(`errors.${res.error}` as "errors.unknown"));
    if (!res.data.ok) return setBlocked(res.data.block);
    setFound(res.data);
    setUrl(res.data.url);
    setTitle(res.data.suggestedTitle);
    setDescription((res.data.preview.description ?? "").slice(0, 300));
  }

  const share = () => start(async () => {
    if (!found) return;
    setError(null);
    const res = await shareLink({ url: found.url, title, description, tags, groupId: groupId || null });
    if (!res.ok) {
      const key = res.error.startsWith("link_") ? `blocks.${res.error.slice(5)}` : null;
      return setError(key ? t(key as "blocks.unsafe") : res.error === "duplicate" ? t("alreadyShared") : tc(`errors.${res.error}` as "errors.unknown"));
    }
    draft.clear();
    const group = groups.find((g) => g.id === groupId);
    router.push(group ? `/groups/${group.slug}?tab=links` : docHref(res.data));
  });

  return (
    <div className="flex max-w-[760px] flex-col gap-6">
      <form onSubmit={check} className="flex flex-col gap-2">
        <label className={field.label} htmlFor="link-url">{t("urlLabel")}</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="link-url" type="url" inputMode="url" autoComplete="off" autoFocus value={url} onChange={(e) => { setUrl(e.target.value); setFound(null); setBlocked(null); }}
            onPaste={() => setTimeout(() => document.getElementById("link-check")?.click(), 50)}
            placeholder={t("urlPlaceholder")} className={`${field.input} sm:flex-1`} />
          <button id="link-check" type="submit" disabled={checking || !url.trim()} className={btn.primary}>{checking ? t("checking") : t("check")}</button>
        </div>
        {!found && !blocked && !checking && <span className="text-sm text-muted">{t("checkFirst")}</span>}
      </form>

      {blocked && (
        <Notice tone="error">{t(`blocks.${blocked}` as "blocks.unsafe")}</Notice>
      )}

      {found && (
        <>
          <section aria-label={t("preview")} className={cardFrame}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <strong>{t(`kinds.${found.kind}` as "kinds.page")}</strong>
              <span className="text-muted">· {t(`providers.${found.provider}` as "providers.web")}</span>
              <span className={`ml-auto inline-flex h-6 items-center gap-1 px-2 text-xs font-bold ${found.trust === "caution" ? "bg-red text-on-red" : found.trust === "trusted" ? "bg-ink text-on-ink" : "border border-ink"}`}>
                {found.trust !== "caution" ? <IconCheck size={11} /> : <span aria-hidden="true">!</span>} {t(`trust.${found.trust}`)}
              </span>
            </div>
            <PreviewImage src={found.preview.image} label={t(`kindShort.${found.kind}` as "kindShort.page")} sub={found.host.replace(/^www\./, "")} />
            <strong className="text-lg leading-tight">{title || found.suggestedTitle}</strong>
            {found.preview.description && <p className="m-0 line-clamp-3 text-sm">{found.preview.description}</p>}
            <span className="truncate text-xs text-muted">{found.host.replace(/^www\./, "")}</span>
          </section>
          <section className={`flex flex-col gap-2 border-l-4 p-4 ${found.trust === "caution" ? "border-red bg-surface" : "border-ink bg-surface"}`} role="note">
            <strong>{t(`trust.${found.trust}`)}</strong>
            <span className="text-sm">{t(`trustText.${found.trust}`)}</span>
            {found.notes.filter((n) => n !== "official").length > 0 && (
              <ul className="m-0 flex flex-col gap-1 pl-5 text-sm">{found.notes.filter((n) => n !== "official").map((n) => <li key={n}>{t(`notes.${n}` as "notes.redirect")}</li>)}</ul>
            )}
          </section>

          <label className={field.label}>{t("titleLabel")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field.input} />
          </label>
          <label className={field.label}>{t("descriptionLabel")}
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder={t("descriptionPlaceholder")} className={field.textarea} />
          </label>
          <TagPicker label={t("tagsLabel")} value={tags} onChange={setTags} suggestions={ideas} placeholder={t("tagsPlaceholder")} max={10} />
          {groups.length > 0 && (
            <label className={field.label}>{t("groupLabel")}
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={`${field.select}`}>
                <option value="">{t("everyone")}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{t("inGroup", { name: g.name })}</option>)}
              </select>
            </label>
          )}
          <p className="m-0 text-sm text-muted">{t("privacy")}</p>
          {error && <Notice tone="error">{error}</Notice>}
          <div>
            <button type="button" disabled={pending || title.trim().length < 3} onClick={share} className={btn.primary}>{pending ? t("publishing") : t("publish")}</button>
          </div>
        </>
      )}
      {!found && error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}
