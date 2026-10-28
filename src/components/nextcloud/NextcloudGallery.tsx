import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { credentials, files, NextcloudError, type NextcloudLink } from "@/lib/nextcloud";
import type { Viewer } from "@/lib/db";
import { IconBack, IconFolder } from "../ui/Icons";
import { Notice } from "../ui/Page";
import { btn } from "../ui/styles";
import { NextcloudUpload } from "./NextcloudUpload";

/**
 * The chosen Nextcloud folder as a gallery: its pictures as tiles (small pictures made by Nextcloud, through this server),
 * its sub folders to open (`sub`, an address parameter `base?nc=…`), uploading into it, and the way to the folder in Nextcloud.
 */
export async function NextcloudGallery({ viewer, link, sub = "", base }: { viewer: Viewer; link: NextcloudLink; sub?: string; base: string }) {
  const t = await getTranslations("nextcloud");
  let list: Awaited<ReturnType<typeof files>> = [];
  let error: string | null = null;
  try {
    list = await files(await credentials(viewer, link.id), sub);
  } catch (e) {
    error = e instanceof NextcloudError ? e.message : "unreachable";
  }
  const at = (p: string) => `${base}${base.includes("?") ? "&" : "?"}nc=${encodeURIComponent(p)}`;
  const up = sub.split("/").slice(0, -1).join("/");
  const pictures = list.filter((f) => !f.folder && /^image\/(jpeg|png|gif|webp|heic|heif)$/.test(f.type ?? ""));
  const folders = list.filter((f) => f.folder);
  const others = list.length - pictures.length - folders.length;
  const inNextcloud = `${link.server}/apps/files/?dir=${encodeURIComponent(`/${[link.folder, sub].filter(Boolean).join("/")}`)}`;
  return (
    <section className="flex flex-col gap-3" aria-label={t("gallery")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-lg font-bold">{[link.folder, sub].filter(Boolean).join(" / ")}</h2>
        <span className="flex flex-wrap items-center gap-2">
          <NextcloudUpload id={link.id} />
          <a href={inNextcloud} target="_blank" rel="noopener noreferrer" className={btn.secondarySm}>{t("openInNextcloud")}</a>
        </span>
      </div>
      {error && <Notice tone="error">{t.has(`errors.${error}`) ? t(`errors.${error}` as "errors.unreachable") : t("errors.unreachable")}</Notice>}
      {(sub || folders.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {sub && <Link href={up ? at(up) : base} className={btn.secondarySm}><IconBack size={14} /> {t("folderUp")}</Link>}
          {folders.map((f) => <Link key={f.path} href={at(f.path)} className={btn.secondarySm}><IconFolder size={16} /> {f.name}</Link>)}
        </div>
      )}
      {!error && pictures.length === 0 && <Notice tone="hint">{t("galleryEmpty")}</Notice>}
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 lg:grid-cols-4">
        {pictures.map((f) => {
          const src = `/api/nextcloud/${link.id}?path=${encodeURIComponent(f.path)}`;
          return (
            <li key={f.path}>
              <a href={src} target="_blank" rel="noopener" className="block aspect-square overflow-hidden border border-line bg-chip" title={f.name}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a picture made by Nextcloud, through our own address */}
                <img src={`${src}&size=480`} alt={f.name} loading="lazy" className="h-full w-full object-cover" />
              </a>
            </li>
          );
        })}
      </ul>
      {others > 0 && <span className="text-sm text-muted">{t("files", { n: others })}</span>}
    </section>
  );
}
