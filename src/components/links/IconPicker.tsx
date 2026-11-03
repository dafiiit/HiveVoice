"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { uploadImage } from "@/lib/upload";
import { Popover } from "../ui/Popover";
import { NoteIcon } from "../ui/NoteIcon";
import { IconImage } from "../ui/Icons";
import { btn, field } from "../ui/styles";

// A few to pick from at once; any other emoji can be typed or pasted below them.
const CHOICES = ["📝", "✅", "📌", "⭐", "💡", "📚", "🛒", "🏠", "💼", "🎯", "📅", "🧾", "🔧", "🐞", "🌱", "🎨", "🎵", "✈️", "🍳", "❤️", "⚠️", "🔒", "📣", "🧠"];

/** A note's icon: an emoji or an own picture (the path in the image bucket); both empty is the standard icon. */
export type NoteIconValue = { icon: string | null; image: string | null };

/** The icon in front of a note's title: a click opens a choice of emoji, one's own emoji or picture, or back to the standard icon. */
export function IconPicker({ value, onChange, disabled = false, size = 36 }: { value: NoteIconValue; onChange: (v: NoteIconValue) => void; disabled?: boolean; size?: number }) {
  const t = useTranslations("knowledge");
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const pick = (v: NoteIconValue) => { onChange(v); setOpen(false); setOwn(""); setFailed(false); };
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    // An icon is small: 256 px is plenty, also for sharp screens.
    const res = await uploadImage(f, 256);
    setBusy(false);
    if (res.ok) pick({ icon: null, image: res.path });
    else setFailed(true);
  };
  const shown = <NoteIcon icon={value.icon} image={value.image} size={size} />;
  if (disabled) return shown;
  return (
    <Popover icon ariaLabel={t("noteIcon")} open={open} onOpenChange={setOpen} className="flex-none [&>summary]:h-auto [&>summary]:w-auto [&>summary]:border-0 [&>summary]:p-0"
      label={shown}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-6 gap-1" role="group" aria-label={t("noteIcon")}>
          {CHOICES.map((c) => (
            <button key={c} type="button" onClick={() => pick({ icon: c, image: null })} aria-pressed={c === value.icon} aria-label={c}
              className={`inline-flex h-10 w-10 items-center justify-center border-0 text-xl ${c === value.icon ? "bg-ink" : "bg-transparent hover:bg-chip"}`}>{c}</button>
          ))}
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (own.trim()) pick({ icon: own.trim(), image: null }); }}>
          <input value={own} onChange={(e) => setOwn(e.target.value)} maxLength={16} aria-label={t("noteIconOwn")} placeholder={t("noteIconOwn")} className={`${field.input} h-9 min-w-0 flex-1 text-sm`} />
          <button type="submit" className={btn.secondarySm} disabled={!own.trim()}>{t("noteIconUse")}</button>
        </form>
        <button type="button" disabled={busy} onClick={() => file.current?.click()} className={`${btn.secondarySm} justify-center gap-2`}>
          <IconImage size={16} /> {busy ? t("imageUploading") : t("noteIconImage")}
        </button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
        {failed && <span className="text-sm font-bold text-red">{t("noteIconImageFailed")}</span>}
        {(value.icon || value.image) && <button type="button" onClick={() => pick({ icon: null, image: null })} className={`${btn.secondarySm} justify-center`}>{t("noteIconReset")}</button>}
      </div>
    </Popover>
  );
}
