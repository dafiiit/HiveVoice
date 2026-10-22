"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { IconArrow, IconClose, IconEllipse, IconPen, IconRect, IconText, IconUndo } from "./ui/Icons";
import { btn } from "./ui/styles";

type ShapeKind = "rect" | "ellipse" | "arrow";
type Tool = "pen" | "shape" | "text";
type Mark =
  | { kind: "pen"; pts: number[]; color: string; w: number }
  | { kind: ShapeKind; x1: number; y1: number; x2: number; y2: number; color: string; w: number }
  | { kind: "text"; x: number; y: number; text: string; color: string; w: number };

const COLORS = [
  { id: "red", hex: "#e2001a" },
  { id: "black", hex: "#111111" },
  { id: "white", hex: "#ffffff" },
  { id: "yellow", hex: "#ffd400" },
  { id: "blue", hex: "#1a5fe2" },
  { id: "green", hex: "#1a9e3a" },
] as const;
const WIDTHS = [{ id: "thin", f: 2 }, { id: "medium", f: 4 }, { id: "thick", f: 8 }] as const;
const SHAPES: { id: ShapeKind; icon: (p: { size?: number }) => ReactNode }[] = [
  { id: "rect", icon: IconRect }, { id: "ellipse", icon: IconEllipse }, { id: "arrow", icon: IconArrow },
];
// The edited picture is stored at most this large; uploads shrink it further.
const MAX_SIDE = 2048;
const fontOf = (w: number) => `bold ${Math.round(w * 6)}px system-ui, sans-serif`;

function draw(ctx: CanvasRenderingContext2D, m: Mark) {
  ctx.strokeStyle = ctx.fillStyle = m.color;
  ctx.lineWidth = m.w;
  ctx.lineCap = ctx.lineJoin = "round";
  ctx.beginPath();
  if (m.kind === "pen") {
    ctx.moveTo(m.pts[0], m.pts[1]);
    if (m.pts.length === 2) ctx.lineTo(m.pts[0] + 0.1, m.pts[1]);
    for (let i = 2; i < m.pts.length; i += 2) ctx.lineTo(m.pts[i], m.pts[i + 1]);
    ctx.stroke();
  } else if (m.kind === "rect") {
    ctx.strokeRect(Math.min(m.x1, m.x2), Math.min(m.y1, m.y2), Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
  } else if (m.kind === "ellipse") {
    ctx.ellipse((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2, Math.abs(m.x2 - m.x1) / 2, Math.abs(m.y2 - m.y1) / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (m.kind === "arrow") {
    const a = Math.atan2(m.y2 - m.y1, m.x2 - m.x1);
    const head = m.w * 4;
    ctx.moveTo(m.x1, m.y1);
    ctx.lineTo(m.x2, m.y2);
    ctx.moveTo(m.x2 - head * Math.cos(a - 0.5), m.y2 - head * Math.sin(a - 0.5));
    ctx.lineTo(m.x2, m.y2);
    ctx.lineTo(m.x2 - head * Math.cos(a + 0.5), m.y2 - head * Math.sin(a + 0.5));
    ctx.stroke();
  } else if (m.kind === "text") {
    ctx.font = fontOf(m.w);
    ctx.textBaseline = "top";
    m.text.split("\n").forEach((line, i) => ctx.fillText(line, m.x, m.y + i * m.w * 7));
  }
}

/**
 * Draw on a photo before it is sent or published: pen, rectangle, circle, arrow and text in six colours
 * and three line widths, undo, then save as a new JPEG. Covers the whole screen; the photo is never changed in place.
 * `onSave` gets the result and returns an error text or null.
 */
export function ImageEditor({ src, onSave, onClose }: { src: string; onSave: (jpeg: Blob) => Promise<string | null>; onClose: () => void }) {
  const t = useTranslations("images.editor");
  const canvas = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [draft, setDraft] = useState<Mark | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [shape, setShape] = useState<ShapeKind>("rect");
  const [color, setColor] = useState<string>(COLORS[0].hex);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]["id"]>("medium");
  const [menu, setMenu] = useState<"shape" | "color" | "width" | null>(null);
  const [typing, setTyping] = useState<{ x: number; y: number; text: string } | null>(null);
  // Where the text field sits on screen over the canvas: scale and offset.
  const [box, setBox] = useState({ s: 1, l: 0, t: 0 });
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Line width in picture pixels, so a mark looks the same on a small and a large photo.
  const unit = size ? Math.max(size.w, size.h) / 800 : 1;
  const w = WIDTHS.find((x) => x.id === width)!.f * unit;

  useEffect(() => {
    const el = new Image();
    if (!src.startsWith("blob:")) el.crossOrigin = "anonymous"; // stored photos come from another origin; keeps the canvas exportable
    el.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(el.naturalWidth, el.naturalHeight));
      img.current = el;
      setSize({ w: Math.round(el.naturalWidth * scale), h: Math.round(el.naturalHeight * scale) });
    };
    el.onerror = () => setFailed(true);
    el.src = src;
  }, [src]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx || !size || !img.current) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.drawImage(img.current, 0, 0, size.w, size.h);
    for (const m of marks) draw(ctx, m);
    if (draft) draw(ctx, draft);
  }, [size, marks, draft]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const undo = useCallback(() => setMarks((m) => m.slice(0, -1)), []);
  const close = useCallback(() => (marks.length ? setConfirm(true) : onClose()), [marks.length, onClose]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.key === "z" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); undo(); }
      else if (e.key === "Escape") { if (menu) setMenu(null); else close(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [undo, close, menu]);

  /** Pointer position in picture pixels. */
  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * size!.w) / r.width, y: ((e.clientY - r.top) * size!.h) / r.height };
  };
  // Enter, a click elsewhere and blur can all end typing in the same moment: only the first one adds the text.
  const typed = useRef(typing);
  const type = (next: typeof typing) => { typed.current = next; setTyping(next); };
  const pendingText = (): Mark | null => {
    const cur = typed.current;
    return cur?.text.trim() ? { kind: "text", x: cur.x, y: cur.y, text: cur.text, color, w } : null;
  };
  const commitText = () => {
    const m = pendingText();
    if (m) setMarks((all) => [...all, m]);
    type(null);
  };
  const down = (e: React.PointerEvent) => {
    if (!size) return;
    setMenu(null);
    const p = at(e);
    if (tool === "text") {
      wasTyping.current = !!typed.current;
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDraft(tool === "pen" ? { kind: "pen", pts: [p.x, p.y], color, w } : { kind: shape, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, w });
  };
  const move = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = at(e);
    setDraft(draft.kind === "pen" ? { ...draft, pts: [...draft.pts, p.x, p.y] } : draft.kind === "text" ? draft : { ...draft, x2: p.x, y2: p.y });
  };
  // The text field opens on click, after the press has moved the focus; a click while typing only ends the text (on blur).
  const wasTyping = useRef(false);
  const click = (e: React.MouseEvent) => {
    if (tool !== "text" || !size || wasTyping.current) return;
    const c = canvas.current!;
    const r = c.getBoundingClientRect();
    const p = { x: ((e.clientX - r.left) * size.w) / r.width, y: ((e.clientY - r.top) * size.h) / r.height };
    setBox({ s: c.clientWidth / size.w, l: c.offsetLeft, t: c.offsetTop });
    type({ x: p.x, y: p.y - w * 3, text: "" });
  };
  const up = () => {
    if (!draft) return;
    const tiny = draft.kind !== "pen" && draft.kind !== "text" && Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) < 3 * unit;
    if (!tiny) setMarks((m) => [...m, draft]);
    setDraft(null);
  };

  const save = async () => {
    if (!size || !img.current) return;
    const all = [...marks, pendingText()].filter((m): m is Mark => !!m);
    commitText();
    setSaving(true);
    setError(null);
    // Drawn again on a canvas of its own, so text still being typed is included.
    const out = document.createElement("canvas");
    out.width = size.w;
    out.height = size.h;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.drawImage(img.current, 0, 0, size.w, size.h);
    all.forEach((m) => draw(ctx, m));
    const blob = await new Promise<Blob | null>((r) => out.toBlob(r, "image/jpeg", 0.9));
    const err = blob ? await onSave(blob) : t("saveFailed");
    setSaving(false);
    if (err) setError(err);
  };

  const toolBtn = (on: boolean) => `inline-flex h-9 w-9 flex-none items-center justify-center border-0 p-0 ${on ? "bg-ink text-on-ink" : "bg-transparent text-ink"}`;
  const caret = "inline-flex h-9 w-5 flex-none items-center justify-center border-0 bg-transparent p-0 text-xs text-ink";
  const panel = "absolute left-0 top-full z-10 mt-1 gap-1 border border-ink bg-surface p-1";
  const ShapeIcon = SHAPES.find((s) => s.id === shape)!.icon;

  // On the body, so no stacking context of the page (bars, columns) can cover it.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t("title")} className="fixed inset-0 z-[80] flex flex-col bg-black/95">
      <div role="toolbar" aria-label={t("title")} className="flex flex-none flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-ink bg-surface px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button type="button" aria-label={t("pen")} title={t("pen")} aria-pressed={tool === "pen"} onClick={() => setTool("pen")} className={toolBtn(tool === "pen")}><IconPen /></button>
          <span className="relative flex">
            <button type="button" aria-label={t(shape)} title={t(shape)} aria-pressed={tool === "shape"} onClick={() => setTool("shape")} className={toolBtn(tool === "shape")}><ShapeIcon /></button>
            <button type="button" aria-label={t("shapes")} aria-expanded={menu === "shape"} onClick={() => setMenu(menu === "shape" ? null : "shape")} className={caret}>▾</button>
            {menu === "shape" && (
              <span className={`${panel} flex`}>
                {SHAPES.map((s) => (
                  <button key={s.id} type="button" aria-label={t(s.id)} title={t(s.id)} onClick={() => { setShape(s.id); setTool("shape"); setMenu(null); }} className={toolBtn(shape === s.id)}><s.icon /></button>
                ))}
              </span>
            )}
          </span>
          <button type="button" aria-label={t("text")} title={t("text")} aria-pressed={tool === "text"} onClick={() => setTool("text")} className={toolBtn(tool === "text")}><IconText /></button>
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
          <span className="relative flex">
            <button type="button" aria-label={t("color")} title={t("color")} aria-expanded={menu === "color"} onClick={() => setMenu(menu === "color" ? null : "color")} className="inline-flex h-9 flex-none items-center gap-1 border-0 bg-transparent px-1.5 text-xs text-ink">
              <span className="block h-5 w-5 border border-line-strong" style={{ background: color }} />▾
            </button>
            {menu === "color" && (
              <span className={`${panel} grid w-max grid-cols-3`}>
                {COLORS.map((c) => (
                  <button key={c.id} type="button" aria-label={t(`colors.${c.id}`)} title={t(`colors.${c.id}`)} aria-pressed={color === c.hex} onClick={() => { setColor(c.hex); setMenu(null); }}
                    className={`inline-flex h-9 w-9 items-center justify-center border-2 bg-transparent p-0 ${color === c.hex ? "border-ink" : "border-transparent"}`}>
                    <span className="block h-6 w-6 border border-line-strong" style={{ background: c.hex }} />
                  </button>
                ))}
              </span>
            )}
          </span>
          <span className="relative flex">
            <button type="button" aria-label={t("width")} title={t("width")} aria-expanded={menu === "width"} onClick={() => setMenu(menu === "width" ? null : "width")} className="inline-flex h-9 flex-none items-center gap-1 border-0 bg-transparent px-1.5 text-xs text-ink">
              <span className="block w-7 bg-ink" style={{ height: WIDTHS.find((x) => x.id === width)!.f }} />▾
            </button>
            {menu === "width" && (
              <span className={`${panel} flex w-max flex-col`}>
                {WIDTHS.map((x) => (
                  <button key={x.id} type="button" aria-pressed={width === x.id} onClick={() => { setWidth(x.id); setMenu(null); }}
                    className={`inline-flex h-9 items-center gap-3 border-0 px-2 text-sm ${width === x.id ? "bg-ink text-on-ink" : "bg-transparent text-ink"}`}>
                    <span className="block w-8 bg-current" style={{ height: x.f }} />{t(`widths.${x.id}`)}
                  </button>
                ))}
              </span>
            )}
          </span>
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
          <button type="button" aria-label={t("undo")} title={t("undo")} disabled={!marks.length} onClick={undo} className={`${toolBtn(false)} disabled:opacity-35`}><IconUndo /></button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {confirm ? (
            <>
              <span className="px-1 text-sm font-bold">{t("discard")}</span>
              <button type="button" onClick={onClose} className={btn.redSm}>{t("discardYes")}</button>
              <button type="button" onClick={() => setConfirm(false)} className={btn.secondarySm}>{t("keep")}</button>
            </>
          ) : (
            <>
              <button type="button" disabled={saving || !size || (!marks.length && !typing?.text.trim())} onClick={save} className={btn.primarySm}>{saving ? t("saving") : t("save")}</button>
              <button type="button" aria-label={t("close")} title={t("close")} onClick={close} className={toolBtn(false)}><IconClose /></button>
            </>
          )}
        </div>
      </div>
      {error && <p role="alert" className="m-0 flex-none bg-red px-3 py-2 text-sm font-bold text-on-red">{error}</p>}
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 md:p-6" onPointerDown={() => setMenu(null)}>
        {failed ? <p className="m-0 font-bold text-white">{t("loadFailed")}</p> : !size ? <p className="m-0 text-white">{t("loading")}</p> : null}
        <canvas ref={canvas} width={size?.w ?? 0} height={size?.h ?? 0} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onClick={click}
          className={`block max-h-full max-w-full touch-none ${size ? "" : "hidden"} ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`} />
        {typing && (
          <textarea autoFocus rows={1} value={typing.text} placeholder={t("textPlaceholder")} aria-label={t("text")}
            onChange={(e) => type({ ...typing, text: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); } else if (e.key === "Escape") { e.stopPropagation(); type(null); } }}
            onBlur={commitText}
            className="absolute m-0 resize-none overflow-hidden border border-dashed border-white bg-black/20 p-0 leading-[1.17] outline-none placeholder:text-white/70"
            style={{ left: box.l + typing.x * box.s, top: box.t + typing.y * box.s, color, font: fontOf(w * box.s), minWidth: 120, width: `${Math.max(6, ...typing.text.split("\n").map((l) => l.length + 1))}ch`, height: `${typing.text.split("\n").length * 7 * w * box.s}px` }} />
        )}
      </div>
    </div>,
    document.body,
  );
}
