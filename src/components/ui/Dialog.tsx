"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconClose } from "./Icons";
import { button, field, type ButtonSize, type ButtonVariant } from "./styles";
import { Notice } from "./Page";

/** The one window of the app (share, report, contact, objections): from below on phones, centred on wide screens. */
export function Dialog({ title, kicker, onClose, children, wide = false }: { title: ReactNode; kicker?: ReactNode; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const tc = useTranslations("common");
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} onClick={(e) => e.stopPropagation()}
        className={`flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto bg-surface p-6 ${wide ? "max-w-[600px]" : "max-w-[520px]"}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {kicker && <span className="text-sm text-muted">{kicker}</span>}
            <strong className="text-xl leading-tight">{title}</strong>
          </div>
          <button type="button" onClick={onClose} aria-label={tc("close")} className="-mr-2 -mt-2 inline-flex h-11 w-11 flex-none items-center justify-center border-0 bg-transparent text-ink"><IconClose /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * A button that asks for a reason in a window before it sends (Einspruch, Widerspruch): at least
 * ten characters, a hint what happens next, then the jury takes over.
 */
export function ReasonDialog({ label, title, reasonLabel, hint, sendLabel, onSend, variant = "secondary", size = "md", look, className = "" }: {
  label: ReactNode; title: string; reasonLabel: string; hint: ReactNode; sendLabel: string;
  onSend: (reason: string) => Promise<{ ok: boolean; error?: string }>;
  variant?: ButtonVariant; size?: ButtonSize; look?: string; className?: string;
}) {
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${look ?? button(variant, size)} ${className}`}>{label}</button>
      {open && (
        <Dialog title={title} onClose={() => setOpen(false)}>
          <form className="flex flex-col gap-3" onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            const res = await onSend(reason);
            setPending(false);
            if (!res.ok) return setError(tc(`errors.${res.error ?? "unknown"}` as "errors.unknown"));
            setOpen(false); setReason("");
          }}>
            <label className={field.label}>{reasonLabel}<textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} className={field.textarea} minLength={10} required /></label>
            <span className={field.hint}>{hint}</span>
            {error && <Notice tone="error">{error}</Notice>}
            <span className="flex gap-2">
              <button type="submit" disabled={pending || reason.trim().length < 10} className={button("primary")}>{sendLabel}</button>
              <button type="button" onClick={() => setOpen(false)} className={button("secondary")}>{tc("cancel")}</button>
            </span>
          </form>
        </Dialog>
      )}
    </>
  );
}
