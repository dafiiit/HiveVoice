"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { uploadAttachment } from "@/lib/upload";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { FILE_ACCEPT, FILE_BUCKET, MAX_FILES, formatSize, pollReady, type PollDraft, type UploadedFile } from "@/lib/files";
import { IconAttach, IconClose, IconFile, IconPlus, IconPoll } from "./ui/Icons";
import { field } from "./ui/styles";

const EMPTY_POLL: PollDraft = { question: "", options: ["", ""], multiple: false };

/** What a person is about to send besides text: uploaded files and a poll draft. Shared by chats, posts and replies. */
export function useExtras() {
  const t = useTranslations("extras");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [poll, setPoll] = useState<PollDraft | null>(null);

  const add = async (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    setError(null);
    const room = MAX_FILES - files.length;
    if (picked.length > room) setError(t("errors.tooMany", { max: MAX_FILES }));
    for (const file of picked.slice(0, Math.max(0, room))) {
      setUploading((n) => n + 1);
      const res = await uploadAttachment(file);
      setUploading((n) => n - 1);
      if (res.ok) setFiles((f) => [...f, res.file]);
      else setError(t(`errors.${res.error}`));
    }
  };
  const remove = (path: string) => {
    setFiles((f) => f.filter((x) => x.path !== path));
    // Not sent yet, so the stored copy can go (the database refuses to delete files that belong to something).
    void createSupabaseBrowser().storage.from(FILE_BUCKET).remove([path]);
  };
  const clear = () => { setFiles([]); setPoll(null); setError(null); };
  /** Puts back what was about to be sent when sending failed. */
  const restore = (f: UploadedFile[], p: PollDraft | null) => { setFiles(f); setPoll(p); };
  return {
    files, uploading, error, poll, setPoll, add, remove, clear, restore,
    /** Something besides text is attached and ready. */
    has: files.length > 0 || pollReady(poll),
    /** A poll draft that is not finished yet, or an upload still running: sending must wait. */
    blocked: uploading > 0 || (!!poll && !pollReady(poll)),
  };
}
export type Extras = ReturnType<typeof useExtras>;

/** The two buttons next to the text field: attach a photo or file, create a poll. */
export function ExtrasButtons({ x, polls = true, size = "md" }: { x: Extras; polls?: boolean; size?: "sm" | "md" }) {
  const t = useTranslations("extras");
  const input = useRef<HTMLInputElement>(null);
  const box = size === "sm" ? "h-10 w-10" : "h-11 w-11";
  const cls = `inline-flex ${box} flex-none items-center justify-center border p-0`;
  const off = "border-line bg-surface text-ink";
  return (
    <>
      <button type="button" aria-label={t("attach")} title={t("attach")} onClick={() => input.current?.click()} className={`${cls} ${off}`}><IconAttach size={20} /></button>
      {polls && (
        <button type="button" aria-label={t("pollCreate")} title={t("pollCreate")} aria-pressed={!!x.poll} onClick={() => x.setPoll(x.poll ? null : { ...EMPTY_POLL })}
          className={`${cls} ${x.poll ? "border-ink bg-ink text-on-ink" : off}`}><IconPoll size={20} /></button>
      )}
      <input ref={input} type="file" multiple accept={FILE_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { void x.add(e.target.files); e.target.value = ""; }} />
    </>
  );
}

/** Chosen files and the poll form, shown above the text field. */
export function ExtrasPreview({ x }: { x: Extras }) {
  const t = useTranslations("extras");
  const set = (p: Partial<PollDraft>) => x.setPoll((cur) => (cur ? { ...cur, ...p } : cur));
  return (
    <div className="flex max-h-[42dvh] min-w-0 flex-col gap-2 overflow-y-auto empty:hidden">
      {(x.files.length > 0 || x.uploading > 0) && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {x.files.map((f) => (
            <li key={f.path} className="flex max-w-full items-center gap-2 border border-line bg-surface py-1 pl-2.5 pr-1 text-sm">
              <IconFile size={16} className="flex-none" />
              <span className="min-w-0 truncate">{f.name}</span>
              <span className="flex-none text-xs text-muted">{formatSize(f.size)}</span>
              <button type="button" aria-label={t("removeFile", { name: f.name })} onClick={() => x.remove(f.path)} className="inline-flex h-8 w-8 flex-none items-center justify-center border-0 bg-transparent p-0 text-ink"><IconClose size={14} /></button>
            </li>
          ))}
          {x.uploading > 0 && <li className="flex items-center border border-dashed border-line px-2.5 py-1.5 text-sm text-muted">{t("uploading")}</li>}
        </ul>
      )}
      {x.error && <p role="alert" className="m-0 text-sm font-bold">{x.error}</p>}
      {x.poll && (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border border-ink bg-surface p-3">
          <input value={x.poll.question} maxLength={200} onChange={(e) => set({ question: e.target.value })} aria-label={t("pollQuestion")} placeholder={t("pollQuestion")} className={`${field.inputSm} font-bold`} />
          {x.poll.options.map((o, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input value={o} maxLength={100} onChange={(e) => set({ options: x.poll!.options.map((v, j) => (j === i ? e.target.value : v)) })}
                aria-label={t("pollOption", { n: i + 1 })} placeholder={t("pollOption", { n: i + 1 })} className={`${field.inputSm} min-w-0 flex-1`} />
              {x.poll!.options.length > 2 && (
                <button type="button" aria-label={t("pollRemoveOption", { n: i + 1 })} onClick={() => set({ options: x.poll!.options.filter((_, j) => j !== i) })}
                  className="inline-flex h-11 w-11 flex-none items-center justify-center border-0 bg-transparent p-0 text-ink"><IconClose size={16} /></button>
              )}
            </div>
          ))}
          {x.poll.options.length < 6 && (
            <button type="button" onClick={() => set({ options: [...x.poll!.options, ""] })} className="inline-flex h-10 items-center gap-1.5 self-start border-0 bg-transparent p-0 text-sm font-bold text-ink"><IconPlus size={14} /> {t("pollAdd")}</button>
          )}
          <label className="flex flex-wrap items-center gap-2 text-sm">{t("pollDuration")}
            <select value={x.poll.hours ?? 0} onChange={(e) => set({ hours: Number(e.target.value) })} className={`${field.select} h-10`}>
              <option value={0}>{t("pollNoEnd")}</option><option value={24}>{t("pollDay")}</option><option value={168}>{t("pollWeek")}</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={x.poll.multiple} onChange={(e) => set({ multiple: e.target.checked })} className="h-5 w-5 accent-[var(--ink)]" /> {t("pollMultiple")}</label>
          <button type="button" onClick={() => x.setPoll(null)} className="inline-flex h-9 items-center self-start border-0 bg-transparent p-0 text-sm text-muted underline">{t("pollRemove")}</button>
        </fieldset>
      )}
    </div>
  );
}
