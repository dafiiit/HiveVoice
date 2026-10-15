"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { uploadImage } from "@/lib/upload";
import { imageUrl } from "@/lib/images";
import { setAvatar } from "@/lib/actions/images";
import { Avatar } from "./ui/Avatar";
import { btn } from "./ui/styles";

/** Several photos for a request or an offer. The first one is the cover. */
export function ImagePicker({ value, onChange, max = 4 }: { value: string[]; onChange: (paths: string[]) => void; max?: number }) {
  const t = useTranslations("images");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const next = [...value];
    for (const file of Array.from(files).slice(0, max - value.length)) {
      const res = await uploadImage(file);
      if (res.ok) next.push(res.path);
      else setError(t(`errors.${res.error}`));
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold">{t("photos")} <span className="text-[13px] font-normal text-muted">{t("photosHint", { max })}</span></span>
      <div className="flex flex-wrap gap-2">
        {value.map((p, i) => (
          <div key={p} className="relative h-24 w-24 flex-none bg-chip">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl(p) ?? ""} alt={t("photoN", { n: i + 1 })} className="h-full w-full object-cover" />
            {i === 0 && <span className="absolute bottom-0 left-0 bg-ink px-1.5 py-0.5 text-[11px] font-bold text-on-ink">{t("cover")}</span>}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== p))} aria-label={t("remove", { n: i + 1 })}
              className="absolute right-0 top-0 inline-flex h-7 w-7 items-center justify-center border-0 bg-surface text-ink">✕</button>
          </div>
        ))}
        {value.length < max && (
          <button type="button" disabled={busy} onClick={() => input.current?.click()}
            className="inline-flex h-24 w-24 flex-none flex-col items-center justify-center gap-1 border border-dashed border-ink bg-transparent text-sm font-bold text-ink disabled:opacity-45">
            <span aria-hidden="true" className="text-2xl leading-none">+</span>
            {busy ? t("uploading") : t("add")}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple={max > 1} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => add(e.target.files)} />
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
    </div>
  );
}

/** Profile photo: upload, replace or remove. */
export function AvatarUpload({ name, seed, path, size = 120 }: { name: string; seed: number; path: string | null; size?: number }) {
  const t = useTranslations("images");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await uploadImage(file, 640);
    if (!res.ok) {
      setError(t(`errors.${res.error}`));
    } else {
      const saved = await setAvatar(res.path);
      if (!saved.ok) setError(t("errors.upload"));
      else start(() => router.refresh());
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  const remove = () => start(async () => { await setAvatar(null); router.refresh(); });
  const working = busy || pending;

  return (
    <div className="flex flex-col items-start gap-2">
      <Avatar name={name} seed={seed} path={path} size={size} />
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" disabled={working} onClick={() => input.current?.click()} className={`${btn.secondary} h-9 px-3 text-sm`}>{working ? t("uploading") : path ? t("change") : t("addPhoto")}</button>
        {path && <button type="button" disabled={working} onClick={remove} className={`${btn.ghost} h-9 text-sm`}>{t("removePhoto")}</button>}
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.target.files)} />
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
    </div>
  );
}
