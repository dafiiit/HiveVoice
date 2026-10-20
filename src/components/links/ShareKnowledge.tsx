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

/** Sharing knowledge in three ways: a link to something elsewhere, a file (photo, PDF), or a Markdown note written here. */
export function ShareKnowledge({ groups, initialGroup, ideas, initialMode = "link" }: { groups: Group[]; initialGroup: string | null; ideas: string[]; initialMode?: Mode }) {
  const t = useTranslations("knowledge");
  const tl = useTranslations("links");
  const [mode, setMode] = useState<Mode>(initialMode);
  // A Markdown file picked in the file form lands in the note editor; the key restarts the editor with its text.
  const [seed, setSeed] = useState<{ n: number; title: string; body: string }>({ n: 0, title: "", body: "" });
  const [notice, setNotice] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label={t("modes")} className={segments}>
        {(["link", "file", "note"] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => { setMode(m); setNotice(false); }} className={segment(mode === m)}>
            {t(m === "link" ? "modeLink" : m === "file" ? "modeFile" : "modeNote")}
          </button>
        ))}
      </div>
      {mode === "link" && <ShareLinkForm groups={groups} initialGroup={initialGroup} ideas={ideas} />}
      {mode === "file" && (
        <ShareFileForm groups={groups} initialGroup={initialGroup} ideas={ideas}
          onMarkdown={(name, text) => { setSeed((s) => ({ n: s.n + 1, title: name.replace(/\.(md|markdown)$/i, "").replace(/[_-]+/g, " "), body: text })); setMode("note"); setNotice(true); }} />
      )}
      {mode === "note" && (
        <>
          {notice && <Notice tone="status" className="text-sm font-normal">{t("markdownLoaded")}</Notice>}
          <NoteEditor key={seed.n} initial={{ title: seed.title, description: "", body: seed.body, tags: [] }} groups={groups} initialGroup={initialGroup} ideas={ideas} />
        </>
      )}
      {mode !== "link" && <p className="sr-only">{tl("privacy")}</p>}
    </div>
  );
}
