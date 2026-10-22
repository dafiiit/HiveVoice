"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { lockResource, releaseResource, saveDiagram } from "@/lib/actions/links";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

// draw.io runs in a frame and talks to the page by messages (embed mode, JSON protocol). It can run on our own server
// (the jgraph/drawio Docker image); without NEXT_PUBLIC_DRAWIO_URL the public embed address is used.
const DRAWIO = (process.env.NEXT_PUBLIC_DRAWIO_URL || "https://embed.diagrams.net").replace(/\/$/, "");
const MAX = 2_000_000;

/** The drawing inside a saved SVG (draw.io keeps it in the `content` attribute). */
function drawingOf(svg: string): string {
  if (!svg) return "";
  const root = new DOMParser().parseFromString(svg, "image/svg+xml").documentElement;
  return root.getAttribute("content") ?? "";
}

/** draw.io hands the export over as a data URI. */
function svgOf(dataUri: string): string {
  const [head, payload = ""] = dataUri.split(",", 2);
  if (!head.includes(";base64")) return decodeURIComponent(payload);
  return new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)));
}

/**
 * Draw a diagram with draw.io, filling the pane. Saving exports the SVG with the drawing inside: it shows as a picture
 * everywhere and opens here again. Each save is a new version. While open, nobody else edits it (a lock, like notes).
 */
export function DiagramEditor({ id, title: initialTitle, svg, base }: { id?: string; title: string; svg: string; base: string }) {
  const t = useTranslations("diagrams");
  const td = useTranslations("docrights.page");
  const locale = useLocale();
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [docId, setDocId] = useState(id);
  const [title, setTitle] = useState(initialTitle);
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lockedBy, setLockedBy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // The latest values for the message handler, which is set up once.
  const state = useRef({ docId, title });
  useEffect(() => { state.current = { docId, title }; }, [docId, title]);

  const post = (msg: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const take = () => lockResource(id).then((res) => { if (alive) setLockedBy(!res.ok && res.error === "locked"); });
    take();
    const beat = setInterval(take, 60_000);
    return () => { alive = false; clearInterval(beat); void releaseResource(id); };
  }, [id]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== new URL(DRAWIO).origin || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let msg: { event?: string; data?: string };
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.event === "init") post({ action: "load", xml: drawingOf(svg), autosave: 1, title: state.current.title });
      else if (msg.event === "autosave") { setDirty(true); setSaved(false); }
      // Ctrl+S inside draw.io: the same as our button.
      else if (msg.event === "save") post({ action: "export", format: "xmlsvg", spinKey: "saving" });
      else if (msg.event === "export" && msg.data) {
        const out = svgOf(msg.data);
        if (out.length > MAX) { setError(t("tooLarge")); return; }
        const { docId: current, title: name } = state.current;
        start(async () => {
          const res = await saveDiagram({ id: current, title: name, svg: out });
          if (!res.ok) { setError(res.error === "title_required" ? t("titleRequired") : res.error === "locked" ? td("locked") : t("saveError")); return; }
          setError(null); setDirty(false); setSaved(true);
          if (!current) {
            // Stay in the editor (keeps undo); the address now names the new diagram.
            setDocId(res.data);
            window.history.replaceState(null, "", `${base}/${res.data}?edit=1`);
          }
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // svg is the starting point only; later saves stay in the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Leaving with unsaved changes asks the browser to warn.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () => {
    if (title.trim().length < 3) { setError(t("titleRequired")); return; }
    setError(null);
    post({ action: "export", format: "xmlsvg", spinKey: "saving" });
  };
  const close = (force = false) => {
    if (dirty && !force) { setLeaving(true); return; }
    router.push(docId ? `${base}/${docId}` : base);
    router.refresh();
  };

  const lang = locale === "en" ? "en" : "de";
  const src = `${DRAWIO}/?embed=1&proto=json&spin=1&libraries=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0&ui=kennedy&lang=${lang}`;
  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-4 py-3">
        <label className={`${field.label} min-w-[200px] flex-1`}>{t("titleLabel")}
          <input value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} placeholder={t("titlePlaceholder")} className={field.input} />
        </label>
        <button type="button" onClick={save} disabled={pending || lockedBy} className={btn.primary}>{pending ? t("saving") : t("save")}</button>
        <button type="button" onClick={() => close()} className={btn.secondary}>{t("close")}</button>
        <span className="basis-full text-sm text-muted" aria-live="polite">{saved ? t("saved") : dirty ? t("unsaved") : t("hint")}</span>
      </div>
      {lockedBy && <Notice tone="error">{td("locked")}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {leaving && (
        <Notice tone="status">
          <span className="flex flex-wrap items-center gap-3">{t("leaveQuestion")}
            <button type="button" onClick={() => close(true)} className={btn.secondarySm}>{t("discard")}</button>
            <button type="button" onClick={() => setLeaving(false)} className={btn.link}>{t("keepEditing")}</button>
          </span>
        </Notice>
      )}
      <iframe ref={frame} src={src} title={t("editorTitle")} className="min-h-0 w-full flex-1 border-0 bg-surface" />
    </div>
  );
}
