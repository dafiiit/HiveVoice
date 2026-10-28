"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Popover } from "../ui/Popover";
import { IconBack, IconMore } from "../ui/Icons";

/**
 * One button of the tool bar: an icon with its name as tooltip. `panel` makes it open a small menu instead of acting
 * (the diagrams to insert); `close` shuts that menu again.
 */
export type Tool = {
  key: string; label: string; icon: ReactNode; keys?: string; disabled?: boolean;
  run?: () => void; panel?: (close: () => void) => ReactNode;
};

const W = 36; // every tool is a 36 px square
const GAP = 4;

/**
 * The tools in one row, like a word processor, with `side` (the views) at its right end. What does not fit moves, from the
 * right, into a "⋯" menu at the end of the row, where each tool shows its icon and name.
 */
export function Toolbar({ label, tools, side, moreLabel, backLabel }: { label: string; tools: Tool[]; side: ReactNode; moreLabel: string; backLabel: string }) {
  const row = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(tools.length);
  const count = tools.length;

  // How many tools fit next to the views: all of them, or as many as leave room for the "⋯" button.
  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () => {
      const free = el.clientWidth - (sideRef.current?.offsetWidth ?? 0) - 2 * GAP;
      const n = Math.floor((free + GAP) / (W + GAP));
      setFit(n >= count ? count : Math.max(0, n - 1));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);

  const shown = tools.slice(0, fit);
  const rest = tools.slice(fit);
  return (
    <div ref={row} role="toolbar" aria-label={label} className="flex min-w-0 items-center gap-1">
      {shown.map((tool) => <ToolButton key={tool.key} tool={tool} />)}
      {rest.length > 0 && <More tools={rest} label={moreLabel} backLabel={backLabel} />}
      <div ref={sideRef} className="ml-auto flex flex-none items-center">{side}</div>
    </div>
  );
}

/** The tooltip: the name and, where there is one, the key that does the same. */
const tip = (t: Tool, mac: boolean) => (t.keys ? `${t.label} (${mac ? "⌘" : "Strg+"}${t.keys})` : t.label);

function useMac() {
  const [mac, setMac] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the platform is only known in the browser
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  return mac;
}

function ToolButton({ tool }: { tool: Tool }) {
  const mac = useMac();
  const [open, setOpen] = useState(false);
  if (tool.panel) {
    return (
      <Popover icon label={tool.icon} ariaLabel={tool.label} open={open} onOpenChange={setOpen} className="flex-none" panelClassName="w-[320px]">
        {tool.panel(() => setOpen(false))}
      </Popover>
    );
  }
  return (
    <button type="button" onClick={tool.run} disabled={tool.disabled} aria-label={tool.label} title={tip(tool, mac)}
      className="inline-flex h-9 w-9 flex-none items-center justify-center border border-line bg-surface text-ink hover:border-ink disabled:opacity-60">
      {tool.icon}
    </button>
  );
}

/** The tools that did not fit. A tool with its own menu shows that menu in place of the list, with a way back. */
function More({ tools, label, backLabel }: { tools: Tool[]; label: string; backLabel: string }) {
  const mac = useMac();
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState<Tool | null>(null);
  const toggle = (now: boolean) => { setOpen(now); if (!now) setInner(null); };
  const close = () => toggle(false);
  return (
    <Popover icon label={<IconMore />} ariaLabel={label} align="right" open={open} onOpenChange={toggle} className="flex-none">
      {inner?.panel ? (
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setInner(null)} className="inline-flex h-9 items-center gap-2 self-start border-0 bg-transparent px-0 text-sm font-bold text-ink">
            <IconBack size={16} /> {backLabel}
          </button>
          {inner.panel(close)}
        </div>
      ) : (
        <div role="menu" aria-label={label} className="flex flex-col">
          {tools.map((tool) => (
            <button key={tool.key} type="button" role="menuitem" disabled={tool.disabled}
              onClick={() => { if (tool.panel) setInner(tool); else { tool.run?.(); close(); } }}
              className="flex h-10 items-center gap-3 border-0 border-b border-line bg-transparent px-1 text-left text-sm text-ink last:border-b-0 hover:bg-chip disabled:opacity-60">
              <span className="inline-flex w-5 justify-center">{tool.icon}</span>
              <span className="flex-1">{tool.label}</span>
              {tool.keys && <span className="text-xs text-muted">{mac ? "⌘" : "Strg+"}{tool.keys}</span>}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}
