"use client";
import { useLayoutEffect, useRef } from "react";

/** A scrolling conversation that starts at, and stays at, the newest message at the bottom. */
export function ChatScroll({ count, className, children }: { count: number; className?: string; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <div ref={box} className={className}
      onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
      {children}
    </div>
  );
}
