"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { lockResource, releaseResource, saveDiagram } from "@/lib/actions/links";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";
import { DraftNotice } from "../ui/DraftNotice";
import { drawingOf, lightSvg } from "@/lib/drawio";
import { useDraft } from "@/lib/drafts";

// draw.io runs in a frame and talks to the page by messages (embed mode, JSON protocol). It can run on our own server
// (the jgraph/drawio Docker image); without NEXT_PUBLIC_DRAWIO_URL the public embed address is used.
const DRAWIO = (process.env.NEXT_PUBLIC_DRAWIO_URL || "https://embed.diagrams.net").replace(/\/$/, "");
const MAX = 2_000_000;
// After the last change: this long until the diagram saves itself.
const AUTOSAVE_MS = 3000;

/** draw.io hands the export over as a data URI. */
function svgOf(dataUri: string): string {
  const [head, payload = ""] = dataUri.split(",", 2);
  if (!head.includes(";base64")) return decodeURIComponent(payload);
  return new TextDecoder().decode(Uint8Array.from(atob(payload), (c) => c.charCodeAt(0)));
}

type Status = "hint" | "unsaved" | "saving" | "saved" | "autosaved";

/**
 * Draw a diagram with draw.io, filling the pane. Saving exports the SVG with the drawing inside: it shows as a picture
 * everywhere and opens here again. While open, nobody else edits it (a lock, like notes).
 * Nothing is lost: once it has a name it saves itself shortly after each change (one version per sitting), and until then
 * the drawing stays on the device. "Schließen" saves what is still open first.
 * `back`: where "Schließen" leads (the note the diagram was opened from); otherwise to the diagram itself.
 * Over a note (`onSaved`, `onClose`): starts from a Mermaid block, reports the new diagram and closes back into the note.
 */
export function DiagramEditor({ id, title: initialTitle, svg, base, back, mermaid, onSaved, onClose }: {
  id?: string; title: string; svg: string; base: string; back?: string;
  mermaid?: string; onSaved?: (id: string, title: string) => void; onClose?: () => void;
}) {
  const t = useTranslations("diagrams");
  const td = useTranslations("docrights.page");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const frame = useRef<HTMLIFrameElement>(null);
  const [docId, setDocId] = useState(id);
  const [title, setTitle] = useState(initialTitle);
  // The drawing as draw.io reports it while one works ("" until something changed).
  const [xml, setXml] = useState("");
  const [dirty, setDirty] = useState(!!mermaid);
  const [status, setStatus] = useState<Status>(mermaid ? "unsaved" : "hint");
  const [leaving, setLeaving] = useState(false);
  const [lockedBy, setLockedBy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The latest values for the message handler, which is set up once.
  const latest = useRef({ docId, title, xml: "", locked: false });
  // A draft that came back is saved as soon as draw.io has loaded it.
  const restored = useRef(false);
  // A Mermaid block is not kept as a draft (it would come back for another block); once saved, it saves itself.
  const draft = useDraft(mermaid ? null : `diagram:${docId ?? "new"}`, { title, xml }, (v) => {
    setTitle(v.title); setXml(v.xml); latest.current.xml = v.xml; latest.current.title = v.title;
    if (v.xml) { restored.current = true; setDirty(true); setStatus("unsaved"); }
  });
  useEffect(() => { latest.current = { ...latest.current, docId, title, locked: lockedBy }; }, [docId, title, lockedBy]);
  // One save at a time; a change during a save is saved right after. `closing`: leave once saved.
  const saving = useRef(false);
  const again = useRef(false);
  const manual = useRef(false);
  const closing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  useEffect(() => { draftRef.current = draft; });

  const post = (msg: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(msg), DRAWIO);
  const requestSave = (byHand: boolean) => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (latest.current.title.trim().length < 3 || latest.current.locked) return false;
    manual.current = manual.current || byHand;
    if (saving.current) { again.current = true; return true; }
    saving.current = true;
    setStatus("saving");
    post({ action: "export", format: "xmlsvg", ...(byHand ? { spinKey: "saving" } : {}) });
    return true;
  };
  const leave = () => {
    if (onClose) { onClose(); return; }
    router.push(back ?? (latest.current.docId ? `${base}/${latest.current.docId}` : base));
    router.refresh();
  };

  useEffect(() => {
    if (!id) return;
    let alive = true;
    const take = () => lockResource(id).then((res) => { if (alive) setLockedBy(!res.ok && res.error === "locked"); });
    take();
    const beat = setInterval(take, 60_000);
    return () => { alive = false; clearInterval(beat); void releaseResource(id); };
  }, [id]);

  useEffect(() => {
    const store = async (out: string) => {
      const { docId: current, title: name } = latest.current;
      const byHand = manual.current;
      manual.current = false;
      const res = await saveDiagram({ id: current, title: name, svg: out, autosave: !byHand });
      saving.current = false;
      if (!res.ok) {
        closing.current = false;
        setStatus("unsaved");
        setError(res.error === "title_required" ? t("titleRequired") : res.error === "locked" ? td("locked")
          : tc.has(`errors.${res.error}`) ? tc(`errors.${res.error}` as "errors.unknown") : t("saveError"));
        return;
      }
      setError(null);
      if (!current) {
        // The draft of a new diagram goes; from now on it is kept under its own id.
        draftRef.current.clear();
        latest.current.docId = res.data;
        setDocId(res.data);
        // Stay in the editor (keeps undo); the address now names the new diagram, or the note learns about it.
        if (onSaved) onSaved(res.data, name.trim());
        else window.history.replaceState(null, "", `${base}/${res.data}?edit=1`);
      } else draftRef.current.clear();
      if (again.current) { again.current = false; requestSave(false); return; }
      setDirty(false);
      setStatus(byHand ? "saved" : "autosaved");
      if (closing.current) leave();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== new URL(DRAWIO).origin || e.source !== frame.current?.contentWindow || typeof e.data !== "string") return;
      let msg: { event?: string; data?: string; xml?: string };
      try { msg = JSON.parse(e.data); } catch { return; }
      // A Mermaid block becomes real draw.io shapes in one group that keeps the Mermaid text (double-click edits it).
      if (msg.event === "init") post(latest.current.xml ? { action: "load", xml: latest.current.xml, autosave: 1, title: latest.current.title }
        : mermaid ? { action: "load", autosave: 1, title: latest.current.title, descriptor: { format: "mermaid", wrap: true, data: mermaid } }
        : { action: "load", xml: drawingOf(svg), autosave: 1, title: latest.current.title });
      else if (msg.event === "load" && restored.current) { restored.current = false; requestSave(false); }
      else if (msg.event === "autosave") {
        if (msg.xml) { latest.current.xml = msg.xml; setXml(msg.xml); }
        setDirty(true);
        setStatus("unsaved");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => requestSave(false), AUTOSAVE_MS);
      }
      // Ctrl+S inside draw.io: the same as our button.
      else if (msg.event === "save") requestSave(true);
      else if (msg.event === "export" && msg.data) {
        const out = lightSvg(svgOf(msg.data));
        if (out.length > MAX) { saving.current = false; setStatus("unsaved"); setError(t("tooLarge")); return; }
        void store(out);
      }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); if (timer.current) clearTimeout(timer.current); };
    // svg is the starting point only; later saves stay in the editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new name saves too (after a pause), once there is something drawn or already saved.
  useEffect(() => {
    if (title === initialTitle && !latest.current.docId) return;
    if (!dirty && !latest.current.docId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => requestSave(false), AUTOSAVE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  // Leaving with changes that are not saved yet asks the browser to warn (they also stay on the device).
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = () => {
    if (title.trim().length < 3) { setError(t("titleRequired")); return; }
    setError(null);
    requestSave(true);
  };
  const close = (force = false) => {
    if (dirty && !force) {
      // Open changes are saved first; without a name that is not possible, so ask.
      closing.current = true;
      if (!requestSave(false)) { closing.current = false; setLeaving(true); }
      return;
    }
    leave();
  };

  const lang = locale === "en" ? "en" : "de";
  const src = `${DRAWIO}/?embed=1&proto=json&spin=1&libraries=1&noSaveBtn=1&noExitBtn=1&saveAndExit=0&ui=kennedy&lang=${lang}`;
  return (
    <div className={`flex flex-col ${onClose ? "h-dvh" : "h-[calc(100dvh-8rem)] md:h-[calc(100dvh-4rem)]"}`}>
      <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-4 py-3">
        <label className={`${field.label} min-w-[200px] flex-1`}>{t("titleLabel")}
          <input value={title} maxLength={200} onChange={(e) => { setTitle(e.target.value); if (status === "saved" || status === "autosaved") setStatus("unsaved"); }} placeholder={t("titlePlaceholder")} className={field.input} />
        </label>
        <button type="button" onClick={save} disabled={status === "saving" || lockedBy} className={btn.primary}>{status === "saving" ? t("saving") : t("save")}</button>
        <button type="button" onClick={() => close()} className={btn.secondary}>{t("close")}</button>
        <span className="basis-full text-sm text-muted" aria-live="polite">{t(`status.${status}`)}</span>
      </div>
      <DraftNotice draft={draft} className="mx-4 my-2" />
      {lockedBy && <Notice tone="error">{td("locked")}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {leaving && (
        <Notice tone="status">
          <span className="flex flex-wrap items-center gap-3">{t("leaveQuestion")}
            <button type="button" onClick={() => close(true)} className={btn.secondarySm}>{t("leaveAnyway")}</button>
            <button type="button" onClick={() => setLeaving(false)} className={btn.link}>{t("keepEditing")}</button>
          </span>
        </Notice>
      )}
      <iframe ref={frame} src={src} title={t("editorTitle")} className="min-h-0 w-full flex-1 border-0 bg-surface" />
    </div>
  );
}
