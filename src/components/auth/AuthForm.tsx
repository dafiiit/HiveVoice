"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { emailAllowed } from "@/lib/actions/growth";
import { forgetLastLogin } from "@/lib/actions/lastLogin";
import type { LastLogin } from "@/lib/lastLogin";
import { Captcha, captchaOn } from "./Captcha";
import { btn, field } from "../ui/styles";
import { Notice } from "@/components/ui/Page";

const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const passkeys = process.env.NEXT_PUBLIC_PASSKEYS === "1";

export function AuthForm({ mode, next, remembered: initialRemembered = null }: { mode: "login" | "signup"; next?: string; remembered?: LastLogin | null }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [remembered, setRemembered] = useState(initialRemembered);
  const [email, setEmail] = useState(initialRemembered?.provider === "email" ? initialRemembered.email : "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [trap, setTrap] = useState("");
  const target = next && next.startsWith("/") ? next : "/connect";
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(mode === "signup" ? "/onboarding" : target)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (trap) return;                 // a field only bots fill in
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password, options: captcha ? { captchaToken: captcha } : undefined });
      if (error) {
        setError(error.code === "email_not_confirmed" ? t("errors.notConfirmed") : t("errors.invalid"));
        setBusy(false);
        return;
      }
      router.replace(`/auth/callback?next=${encodeURIComponent(target)}&session=1`);
      return;
    }
    if (!(await emailAllowed(email))) { setBusy(false); setError(t("errors.disposable")); return; }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(), captchaToken: captcha ?? undefined } });
    setBusy(false);
    if (error) {
      setError(error.code === "weak_password" ? t("errors.weak") : error.code === "user_already_exists" ? t("errors.exists") : error.message);
      return;
    }
    if (data.session) router.replace("/auth/callback?next=/onboarding&session=1");
    else setSent(true);
  }

  // With the remembered address as a hint, Google skips its account chooser when that account is signed in there.
  async function oauth(provider: "google" | "apple", hint?: string) {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callback(), queryParams: hint && provider === "google" ? { login_hint: hint } : undefined } });
  }

  async function passkey() {
    setError(null);
    const supabase = createSupabaseBrowser();
    const auth = supabase.auth as unknown as { signInWithPasskey: () => Promise<{ error: { message: string } | null }> };
    const { error } = await auth.signInWithPasskey();
    if (error) setError(t("errors.passkey"));
    else router.replace(`/auth/callback?next=${encodeURIComponent(target)}&session=1`);
  }

  if (sent) {
    return (
      <section className="flex flex-col gap-4" role="status">
        <h1 className="display m-0">{t("checkMail")}</h1>
        <p className="m-0 max-w-[520px] text-lg">{t("checkMailText", { email })}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <h1 className="display m-0">{mode === "login" ? t("loginTitle") : t("signupTitle")}</h1>
      {mode === "login" && remembered && (remembered.provider === "google" || remembered.provider === "apple") && (
        <div className="flex max-w-[520px] flex-col gap-3 border border-ink bg-surface p-4">
          <strong>{t("remembered.title")}</strong>
          <button type="button" onClick={() => oauth(remembered.provider as "google" | "apple", remembered.email)} className={btn.primary}>
            {t("remembered.continue", { email: remembered.email })}
          </button>
          <button type="button" onClick={async () => { await forgetLastLogin(); setRemembered(null); }} className={`${btn.ghost} self-start`}>{t("remembered.other")}</button>
        </div>
      )}
      {mode === "login" && remembered?.provider === "email" && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 text-sm">
          <span>{t("remembered.asEmail", { email: remembered.email })}</span>
          <button type="button" onClick={async () => { await forgetLastLogin(); setRemembered(null); setEmail(""); }} className={`${btn.linkMuted} text-sm`}>{t("remembered.other")}</button>
        </p>
      )}
      <p className="m-0 max-w-[520px]">{t("intro")}</p>
      {(providers.length > 0 || passkeys) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {providers.includes("google") && <button type="button" onClick={() => oauth("google")} className={btn.secondary}>{t("withGoogle")}</button>}
          {providers.includes("apple") && <button type="button" onClick={() => oauth("apple")} className={btn.secondary}>{t("withApple")}</button>}
          {passkeys && mode === "login" && <button type="button" onClick={passkey} className={btn.secondary}>{t("withPasskey")}</button>}
        </div>
      )}
      <form onSubmit={submit} className="flex flex-col gap-5">
        <label className={field.label}>{t("email")}
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field.input} />
        </label>
        <label className={field.label}>{t("password")}
          <input type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} className={field.input} />
          {mode === "signup" && <span className={field.hint}>{t("passwordHint")}</span>}
        </label>
        <input type="text" name="website" value={trap} onChange={(e) => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
        <Captcha onToken={setCaptcha} />
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy || (captchaOn && !captcha)} className={btn.primary}>{mode === "login" ? t("login") : t("signup")}</button>
          {mode === "login"
            ? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className={btn.ghost}>{t("noAccount")}</Link>
            : <Link href="/login" className={btn.ghost}>{t("haveAccount")}</Link>}
        </div>
      </form>
      <div className="flex flex-col gap-2 border-t border-line pt-5 text-sm">
        <strong>{t("verifyTitle")}</strong>
        <span className="max-w-[520px]">{t("verifyText")}</span>
      </div>
    </section>
  );
}
