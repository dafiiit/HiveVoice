"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { button, field, type ButtonSize, type ButtonVariant } from "./styles";

/** Copies a text (a link) and says so for a moment. */
export function CopyButton({ text, label, variant = "secondary", size = "md", look, className = "" }: {
  text: string; label?: string; variant?: ButtonVariant; size?: ButtonSize; look?: string; className?: string;
}) {
  const t = useTranslations("common");
  const [copied, setCopied] = useState(false);
  return (
    <button type="button" className={`${look ?? button(variant, size)} ${className}`}
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); }}>
      {copied ? t("copied") : label ?? t("copyLink")}
    </button>
  );
}

/** A link to pass on: shown in a field (selected on focus) with a copy button next to it. */
export function CopyField({ value, label, copyLabel }: { value: string; label: string; copyLabel?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-bold">{label}</span>
      <div className="flex flex-wrap gap-2">
        <input readOnly value={value} aria-label={label} onFocus={(e) => e.currentTarget.select()} className={`${field.input} min-w-0 flex-1`} />
        <CopyButton text={value} label={copyLabel} />
      </div>
    </div>
  );
}
