"use client";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { button, type ButtonSize, type ButtonVariant } from "./styles";

type Res = { ok: boolean; error?: string };

/**
 * Runs a server action: `pending` while it works, `error` as a translated message when it fails,
 * and a refresh of the page when it worked (unless `refresh: false`).
 */
export function useAction() {
  const tc = useTranslations("common");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const message = (code?: string) => tc(`errors.${code ?? "unknown"}` as "errors.unknown");
  const run = <R extends Res>(fn: () => Promise<R>, opts: { refresh?: boolean; onOk?: (res: R) => void; onError?: (res: R) => void } = {}) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) { setError(message(res.error)); opts.onError?.(res); return; }
      setError(null);
      opts.onOk?.(res);
      if (opts.refresh !== false) router.refresh();
    });
  return { run, pending, error, setError, message };
}

/** The error line under a control. */
export function ActionError({ error }: { error: string | null }) {
  return error ? <span role="alert" className="text-sm font-bold">{error}</span> : null;
}

/**
 * An on/off button (follow, support, "helped me", block). It switches at once, jumps back when the
 * action fails and then says why. Off looks like an outlined button, on like a filled one (unless `quietOn`).
 */
export function ToggleButton({ on, onToggle, labels, size = "md", offVariant = "secondary", quietOn = false, ariaLabel, className = "" }: {
  on: boolean;
  onToggle: (next: boolean) => Promise<Res>;
  labels: { on: ReactNode; off: ReactNode };
  size?: ButtonSize;
  offVariant?: ButtonVariant;
  quietOn?: boolean;
  ariaLabel?: string;
  className?: string;
}) {
  const [state, setState] = useState(on);
  const [seen, setSeen] = useState(on);
  const { run, pending, error } = useAction();
  // A new value from the server (after a refresh) wins over the local one.
  if (on !== seen) { setSeen(on); setState(on); }
  const look = state ? (quietOn ? `${button("secondary", size)} border-ink` : button("primary", size)) : button(offVariant, size);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button type="button" aria-pressed={state} aria-label={ariaLabel} disabled={pending} className={`${look} ${className}`}
        onClick={() => {
          const next = !state;
          setState(next);
          run(() => onToggle(next), { onError: () => setState(!next) });
        }}>
        {state ? labels.on : labels.off}
      </button>
      <ActionError error={error} />
    </span>
  );
}

/**
 * A button for something that cannot simply be undone (delete, leave, restore). The first click asks in
 * the page ("Really delete? Yes / Cancel") instead of a browser dialog.
 */
export function ConfirmAction({ label, question, confirm, onConfirm, variant = "secondary", size = "md", look, disabled, className = "" }: {
  label: ReactNode;
  question: ReactNode;
  confirm?: ReactNode;
  onConfirm: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Own classes for the first button (e.g. a text link). */
  look?: string;
  disabled?: boolean;
  className?: string;
}) {
  const tc = useTranslations("common");
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return <button type="button" disabled={disabled} className={`${look ?? button(variant, size)} ${className}`} onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span role="group" className={`inline-flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm font-bold">{question}</span>
      <button type="button" disabled={disabled} className={button("red", "sm")} onClick={() => { setAsking(false); onConfirm(); }}>{confirm ?? tc("yes")}</button>
      <button type="button" className={button("secondary", "sm")} onClick={() => setAsking(false)}>{tc("cancel")}</button>
    </span>
  );
}
