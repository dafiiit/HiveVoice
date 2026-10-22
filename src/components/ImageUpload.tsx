"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { uploadImage } from "@/lib/upload";
import { imageUrl } from "@/lib/images";
import { setAvatar } from "@/lib/actions/images";
import { Avatar } from "./ui/Avatar";
import { ImageEditor } from "./ImageEditor";
import { IconPen } from "./ui/Icons";
import { GooglePhotosButton } from "./GooglePhotosButton";
import { btn } from "./ui/styles";

const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

/** Several photos for a request or an offer. The first one is the cover. */
export function ImagePicker({ value, onChange, max = 4 }: { value: string[]; onChange: (paths: string[]) => void; max?: number }) {
  const t = useTranslations("images");
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  // The edited photo is stored as a new file and takes the place of the old one.
  const saveEdit = async (old: string, jpeg: Blob) => {
    const res = await uploadImage(new File([jpeg], "edited.jpg", { type: "image/jpeg" }));
    if (!res.ok) return t(`errors.${res.error}`);
    onChange(value.map((p) => (p === old ? res.path : p)));
    setEditing(null);
    return null;
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const next = [...value];
    for (const file of Array.from(files).filter((f) => f.type.startsWith("image/")).slice(0, max - value.length)) {
      const res = await uploadImage(file);
      if (res.ok) next.push(res.path);
      else setError(t(`errors.${res.error}`));
    }
    onChange(next);
    setBusy(false);
    if (input.current) input.current.value = "";
  };

  return (
    <div
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver(false); void add(e.dataTransfer.files); } }}
      className={`flex flex-col gap-2 p-2 -m-2 ${over ? "bg-chip outline-dashed outline-2 outline-ink" : ""}`}>
      <span className="text-sm font-bold">{t("photos")} <span className="text-[13px] font-normal text-muted">{t("photosHint", { max })}</span></span>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((p, i) => (
            <div key={p} className="relative h-24 w-24 flex-none bg-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl(p) ?? ""} alt={t("photoN", { n: i + 1 })} className="h-full w-full object-cover" />
              {i === 0 && <span className="absolute bottom-0 left-0 bg-ink px-1.5 py-0.5 text-[11px] font-bold text-on-ink">{t("cover")}</span>}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== p))} aria-label={t("remove", { n: i + 1 })}
                className="absolute right-0 top-0 inline-flex h-7 w-7 items-center justify-center border-0 bg-surface text-ink">✕</button>
              <button type="button" onClick={() => setEditing(p)} aria-label={t("editPhoto", { n: i + 1 })} title={t("edit")}
                className="absolute bottom-0 right-0 inline-flex h-7 w-7 items-center justify-center border-0 bg-surface p-0 text-ink"><IconPen size={16} /></button>
            </div>
          ))}
        </div>
      )}
      {value.length < max && (
        <div className="flex flex-wrap items-start gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={`${btn.secondarySm}`}>
            {busy ? t("uploading") : `+ ${t("fromDevice")}`}
          </button>
          <GooglePhotosButton max={max - value.length} onPicked={(paths) => onChange([...value, ...paths].slice(0, max))} className={`${btn.secondarySm}`}>
            {t("fromGoogle")}
          </GooglePhotosButton>
          <span className="self-center text-[13px] text-muted">{over ? t("dropHere") : t("dropHint")}</span>
        </div>
      )}
      <input ref={input} type="file" accept="image/*" multiple={max > 1} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => add(e.target.files)} />
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
      {editing && <ImageEditor src={imageUrl(editing)!} onSave={(jpeg) => saveEdit(editing, jpeg)} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Profile photo: upload, replace or remove. */
export function AvatarUpload({ name, seed, path, size = 120 }: { name: string; seed: number; path: string | null; size?: number }) {
  const t = useTranslations("images");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = async (stored: string) => {
    const saved = await setAvatar(stored);
    if (!saved.ok) setError(t("errors.upload"));
    else start(() => router.refresh());
  };
  const pick = async (files: FileList | null) => {
    const file = Array.from(files ?? []).find((f) => f.type.startsWith("image/"));
    if (!file) return;
    setBusy(true);
    setError(null);
    const res = await uploadImage(file, 640);
    if (!res.ok) setError(t(`errors.${res.error}`));
    else await save(res.path);
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  const remove = () => start(async () => { await setAvatar(null); router.refresh(); });
  const working = busy || pending;

  return (
    <div className="flex w-[160px] max-w-full flex-col items-stretch gap-2"
      onDragOver={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { if (hasFiles(e)) { e.preventDefault(); setOver(false); void pick(e.dataTransfer.files); } }}>
      <div className={`${over ? "outline-dashed outline-2 outline-offset-2 outline-ink" : ""} w-full max-md:[zoom:0.6]`}><Avatar name={name} seed={seed} path={path} size={size} /></div>
      <button type="button" disabled={working} onClick={() => input.current?.click()} className={`${btn.secondarySm} w-full px-2`}>{working ? t("uploading") : path ? t("change") : t("addPhoto")}</button>
      <GooglePhotosButton wide max={1} maxSide={640} onPicked={(paths) => void save(paths[0])} className={`${btn.secondarySm} w-full px-2`}>{t("fromGoogle")}</GooglePhotosButton>
      {path && <button type="button" disabled={working} onClick={remove} className="h-9 w-full border-0 bg-transparent px-0 text-sm text-muted underline">{t("removePhoto")}</button>}
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => pick(e.target.files)} />
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
    </div>
  );
}
