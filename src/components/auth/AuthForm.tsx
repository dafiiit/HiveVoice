"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { btn, field } from "../ui/styles";

const providers = (process.env.NEXT_PUBLIC_AUTH_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const passkeys = process.env.NEXT_PUBLIC_PASSKEYS === "1";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const target = next && next.startsWith("/") ? next : "/connect";
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(mode === "signup" ? "/onboarding" : target)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.code === "email_not_confirmed" ? t("errors.notConfirmed") : t("errors.invalid"));
        setBusy(false);
        return;
      }
      router.replace(`/auth/callback?next=${encodeURIComponent(target)}&session=1`);
      return;
    }
    const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback() } });
    setBusy(false);
    if (error) {
      setError(error.code === "weak_password" ? t("errors.weak") : error.code === "user_already_exists" ? t("errors.exists") : error.message);
      return;
    }
    if (data.session) router.replace("/auth/callback?next=/onboarding&session=1");
    else setSent(true);
  }

  async function oauth(provider: "google" | "apple") {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callback() } });
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
      <p className="m-0 max-w-[520px]">{t("intro")}</p>
      {(providers.length > 0 || passkeys) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {providers.includes("google") && <button type="button" onClick={() => oauth("google")} className={btn.secondaryLg}>{t("withGoogle")}</button>}
          {providers.includes("apple") && <button type="button" onClick={() => oauth("apple")} className={btn.secondaryLg}>{t("withApple")}</button>}
          {passkeys && mode === "login" && <button type="button" onClick={passkey} className={btn.secondaryLg}>{t("withPasskey")}</button>}
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
        {error && <p role="alert" className="m-0 border-l-4 border-red pl-3 font-bold">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={btn.primaryLg}>{mode === "login" ? t("login") : t("signup")}</button>
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
