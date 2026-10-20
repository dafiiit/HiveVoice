"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { shareFile } from "@/lib/actions/links";
import { uploadAttachment } from "@/lib/upload";
import { FILE_ACCEPT, formatSize, isImage, mimeOf, type UploadedFile } from "@/lib/files";
import { TagPicker } from "../TagPicker";
import { IconFile } from "../ui/Icons";
import { btn, field } from "../ui/styles";
import { AccessPicker, type Access } from "./AccessPicker";
import { Notice } from "@/components/ui/Page";

type Group = { id: string; slug: string; name: string };

/** Upload a photo, PDF or document as knowledge. A Markdown file is not stored as a file but opened as an editable note (onMarkdown). */
export function ShareFileForm({ groups, initialGroup, ideas, onMarkdown }: { groups: Group[]; initialGroup: string | null; ideas: string[]; onMarkdown: (name: string, text: string) => void }) {
  const t = useTranslations("knowledge");
  const tl = useTranslations("links");
  const te = useTranslations("extras");
  const tc = useTranslations("common");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [groupId, setGroupId] = useState(groups.find((g) => g.slug === initialGroup)?.id ?? "");
  const [access, setAccess] = useState<Access>({ visibility: groups.some((g) => g.slug === initialGroup) ? "group" : "me", license: "all_rights" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = async (picked: File | undefined) => {
    if (!picked) return;
    setError(null);
    if (mimeOf(picked) === "text/markdown") {
      if (picked.size > 400_000) return setError(t("importTooLarge"));
      return onMarkdown(picked.name, await picked.text());
    }
    setBusy(true);
    const res = await uploadAttachment(picked);
    setBusy(false);
    if (!res.ok) return setError(te(`errors.${res.error}`));
    if (local) URL.revokeObjectURL(local);
    setLocal(isImage(res.file.mime) ? URL.createObjectURL(picked) : null);
    setFile(res.file);
    setTitle((cur) => cur || res.file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
  };

  const share = () => start(async () => {
    if (!file) return;
    setError(null);
    const res = await shareFile({ file, title, description, tags, groupId: groupId || null, visibility: access.visibility, license: access.visibility === "public" ? access.license : undefined });
    if (!res.ok) return setError(t.has(`errors.${res.error}`) ? t(`errors.${res.error}` as "errors.invalid") : tc(`errors.${res.error}` as "errors.unknown"));
    const group = groups.find((g) => g.id === groupId);
    router.push(group ? `/groups/${group.slug}?tab=links` : `/links/${res.data}`);
  });

  return (
    <div className="flex max-w-[760px] flex-col gap-5">
      <div className="flex flex-col gap-2">
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`${btn.secondary} self-start`}>
          {busy ? t("fileUploading") : file ? t("fileChange") : t("fileChoose")}
        </button>
        <span className="text-sm text-muted">{t("fileHint")}</span>
        <input ref={input} type="file" accept={`${FILE_ACCEPT},.markdown`} className="sr-only" tabIndex={-1} aria-hidden="true"
          onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {file && (
        <>
          <section aria-label={t("uploadedFile")} className="flex items-center gap-3 border border-ink border-t-[6px] bg-surface p-4">
            {local
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={local} alt="" className="h-20 w-20 flex-none object-cover" />
              : <IconFile size={40} className="flex-none" />}
            <span className="flex min-w-0 flex-col"><strong className="truncate">{file.name}</strong><span className="text-sm text-muted">{formatSize(file.size)}</span></span>
          </section>
          <label className={field.label}>{tl("titleLabel")}
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={field.input} />
          </label>
          <label className={field.label}>{tl("descriptionLabel")}
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} placeholder={tl("descriptionPlaceholder")} className={field.textarea} />
          </label>
          <TagPicker label={tl("tagsLabel")} value={tags} onChange={setTags} suggestions={ideas} placeholder={tl("tagsPlaceholder")} max={10} />
          {groups.length > 0 && (
            <label className={field.label}>{tl("groupLabel")}
              <select value={groupId} onChange={(e) => { setGroupId(e.target.value); setAccess((a) => ({ ...a, visibility: e.target.value ? "group" : "me" })); }} className={`${field.select}`}>
                <option value="">{tl("everyone")}</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{tl("inGroup", { name: g.name })}</option>)}
              </select>
            </label>
          )}
          <AccessPicker value={access} onChange={setAccess} inGroup={!!groupId} />
          <div>
            <button type="button" disabled={pending || title.trim().length < 3} onClick={share} className={btn.primary}>{pending ? tl("publishing") : tl("publish")}</button>
          </div>
        </>
      )}
    </div>
  );
}
