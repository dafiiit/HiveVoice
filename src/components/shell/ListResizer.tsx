"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LIST_COOKIE, LIST_MAX, LIST_MIN, clampList as clamp } from "./listWidth";

/**
 * The line between the list and the opened item: drag it (or use the arrow keys) to make the list wider or narrower,
 * a double click goes back to the standard width. The width is a CSS variable on the shell, kept in a cookie
 * so the next page is drawn at once in the same width (all areas share it).
 */
export function ListResizer() {
  const t = useTranslations("connect");
  const handle = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState<number | null>(null);

  const list = () => handle.current?.parentElement?.previousElementSibling as HTMLElement | null;
  const shell = () => handle.current?.closest<HTMLElement>("[data-shell]") ?? null;
  const apply = (w: number | null) => {
    const root = shell();
    if (!root) return;
    if (w === null) {
      root.style.removeProperty("--list-w");
      document.cookie = `${LIST_COOKIE}=; path=/; max-age=0; samesite=lax`;
    } else {
      root.style.setProperty("--list-w", `${w}px`);
      document.cookie = `${LIST_COOKIE}=${w}; path=/; max-age=31536000; samesite=lax`;
    }
    setNow(w);
  };
  const current = () => list()?.getBoundingClientRect().width ?? 380;

  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = current();
    const root = shell();
    e.currentTarget.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    let w = startW;
    const move = (ev: PointerEvent) => {
      w = clamp(startW + ev.clientX - startX);
      root?.style.setProperty("--list-w", `${w}px`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      apply(w);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const key = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    const w = current();
    const next = e.key === "ArrowLeft" ? w - step : e.key === "ArrowRight" ? w + step : e.key === "Home" ? LIST_MIN : e.key === "End" ? LIST_MAX : null;
    if (next === null) return;
    e.preventDefault();
    apply(clamp(next));
  };

  return (
    <div className="relative z-20 w-0 flex-none max-md:hidden">
      <div ref={handle} role="separator" aria-orientation="vertical" tabIndex={0} aria-label={t("listWidth")} title={t("listWidthHint")}
        aria-valuemin={LIST_MIN} aria-valuemax={LIST_MAX} aria-valuenow={now ?? undefined}
        onPointerDown={down} onKeyDown={key} onDoubleClick={() => apply(null)}
        className="group absolute inset-y-0 -left-1.5 flex w-3 cursor-col-resize touch-none justify-center outline-none">
        <span className="h-full w-0.5 bg-transparent transition-colors group-hover:bg-ink group-focus-visible:bg-ink group-active:bg-ink" />
      </div>
    </div>
  );
}

