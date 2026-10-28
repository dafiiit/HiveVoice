"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { nextcloudUpload } from "@/lib/actions/nextcloud";
import { shrinkToJpeg } from "@/lib/upload";
import { IconUpload } from "../ui/Icons";
import { btn } from "../ui/styles";

/** Puts photos into the gallery's Nextcloud folder; large photos are made smaller (2560 px) in the browser before. */
export function NextcloudUpload({ id }: { id: string }) {
  const t = useTranslations("nextcloud");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ error: boolean; text: string } | null>(null);
  const send = async (list: File[]) => {
    if (!list.length) return;
    setBusy(true);
    setNote(null);
    const form = new FormData();
    for (const f of list) {
      const small = f.type.startsWith("image/") && f.size > 3_000_000 ? await shrinkToJpeg(f, 2560) : null;
      form.append("files", small ? new File([small], f.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }) : f);
    }
    const res = await nextcloudUpload(id, form);
    setBusy(false);
    if (!res.ok) return setNote({ error: true, text: t.has(`errors.${res.error}`) ? t(`errors.${res.error}` as "errors.upload_failed") : t("errors.upload_failed") });
    setNote({ error: false, text: t("uploaded", { n: res.data.length }) });
    router.refresh();
  };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className={btn.secondarySm}>
        <IconUpload size={16} /> {busy ? t("uploading") : t("upload")}
      </button>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { void send([...(e.target.files ?? [])]); e.target.value = ""; }} />
      {note && <span role={note.error ? "alert" : "status"} className={`text-sm ${note.error ? "font-bold" : "text-muted"}`}>{note.text}</span>}
    </span>
  );
}
