"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { ShareLinkForm } from "./ShareLinkForm";
import { ShareFileForm } from "./ShareFileForm";
import { NoteEditor } from "./NoteEditor";
import { segment, segments } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

type Group = { id: string; slug: string; name: string };
type Mode = "link" | "file" | "note";

/**
 * Two things to make: a Markdown note written here (Notiz), or an upload from outside (a file such as a photo or PDF, or a link).
 * A Markdown file picked as an upload becomes a note.
 */
export function ShareKnowledge({ groups, initialGroup, ideas, initialMode = "link", startList = false }: { groups: Group[]; initialGroup: string | null; ideas: string[]; initialMode?: Mode; startList?: boolean }) {
  const t = useTranslations("knowledge");
  const tl = useTranslations("links");
  const [mode, setMode] = useState<Mode>(initialMode);
  // A Markdown file picked in the file form lands in the note editor; the key restarts the editor with its text.
  const [seed, setSeed] = useState<{ n: number; title: string; body: string }>({ n: 0, title: "", body: "" });
  const [notice, setNotice] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      {initialMode !== "note" && <div role="radiogroup" aria-label={t("modes")} className={segments}>
        {(["file", "link"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setNotice(false); }} className={segment(mode === m)}>
            {t(m === "link" ? "modeLink" : "modeFile")}
          </button>
        ))}
      </div>}
      {mode === "link" && <ShareLinkForm groups={groups} initialGroup={initialGroup} ideas={ideas} />}
      {mode === "file" && (
        <ShareFileForm groups={groups} initialGroup={initialGroup} ideas={ideas}
          onMarkdown={(name, text) => { setSeed((s) => ({ n: s.n + 1, title: name.replace(/\.(md|markdown)$/i, "").replace(/[_-]+/g, " "), body: text })); setMode("note"); setNotice(true); }} />
      )}
      {mode === "note" && (
        <>
          {notice && <Notice tone="status" className="text-sm font-normal">{t("markdownLoaded")}</Notice>}
          <NoteEditor key={seed.n} initial={{ title: seed.title, description: "", body: seed.body, tags: [] }} ideas={ideas}
            groupId={groups.find((g) => g.slug === initialGroup)?.id ?? null} unsaved={seed.n > 0} startView={startList && seed.n === 0 ? "list" : undefined} autoFocus />
        </>
      )}
      {mode !== "link" && <p className="sr-only">{tl("privacy")}</p>}
    </div>
  );
}
