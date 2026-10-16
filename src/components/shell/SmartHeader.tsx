"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A sticky header for pages without the app shell. It slides away while the reader moves down the page
 * and returns on any upward scroll, when the pointer reaches the top edge, or when keyboard focus moves into it.
 */
export function SmartHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = window.scrollY;
    let travel = 0;
    let frame = 0;

    // The header stays while the pointer rests on it, while a menu inside it is open, or while keyboard focus is inside.
    const held = () => el.matches(":hover") || !!el.querySelector('[aria-expanded="true"], :focus-visible');

    const update = () => {
      frame = 0;
      const y = Math.max(0, window.scrollY);
      const dy = y - last;
      last = y;
      if (y <= el.offsetHeight) { travel = 0; setHidden(false); return; }
      if (held()) { travel = 0; return; }
      travel = Math.sign(dy) === Math.sign(travel) ? travel + dy : dy;
      if (travel > 12) setHidden(true);
      else if (travel < -6) setHidden(false);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onPointer = (e: PointerEvent) => { if (e.pointerType === "mouse" && e.clientY <= 36) setHidden(false); };
    const show = () => setHidden(false);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointermove", onPointer, { passive: true });
    el.addEventListener("focusin", show);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointermove", onPointer);
      el.removeEventListener("focusin", show);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header ref={ref} data-hidden={hidden || undefined}
      className={`sticky top-0 z-30 border-b border-line bg-paper transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] data-[hidden]:-translate-y-full ${className}`}>
      {children}
    </header>
  );
}
