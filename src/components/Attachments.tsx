"use client";
import { useTranslations } from "next-intl";
import { formatSize, isImage, type Attachment } from "@/lib/files";
import { IconFile } from "./ui/Icons";

/** Photos as pictures, everything else as a line with name and size. Opening goes through /api/files, which checks who may read it. */
export function Attachments({ items, align = "start" }: { items: Attachment[]; align?: "start" | "end" }) {
  const t = useTranslations("extras");
  if (!items.length) return null;
  const photos = items.filter((a) => isImage(a.mime));
  const files = items.filter((a) => !isImage(a.mime));
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${align === "end" ? "items-end" : "items-start"}`}>
      {photos.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 ${align === "end" ? "justify-end" : ""}`}>
          {photos.map((a) => (
            <a key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noopener" title={t("open")} className="block bg-chip">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${a.id}`} alt={a.name} loading="lazy" decoding="async" className="block max-h-56 max-w-full object-cover sm:max-h-64" />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a key={a.id} href={`/api/files/${a.id}${a.mime === "application/pdf" ? "" : "?dl=1"}`} target={a.mime === "application/pdf" ? "_blank" : undefined} rel="noopener"
          className="flex max-w-full items-center gap-2.5 border border-line bg-surface px-3 py-2 text-ink no-underline">
          <IconFile size={22} className="flex-none" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">{a.name}</span>
            <span className="text-xs text-muted">{formatSize(a.size_bytes)} · {a.mime === "application/pdf" ? t("open") : t("download")}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
