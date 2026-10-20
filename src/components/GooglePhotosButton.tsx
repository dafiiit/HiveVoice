"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { checkPhotoPicker, importPickedPhotos, startPhotoPicker } from "@/lib/actions/google-photos";
import { GOOGLE_CLIENT_ID, loadGoogleScript, requestPhotosToken } from "@/lib/google-token";
import { btn } from "./ui/styles";

/**
 * "From Google Photos": Google asks for permission once, the member picks photos in
 * Google's own picker, and the chosen ones are copied into HiveVoice. Hidden until the
 * Google client id is configured.
 */
export function GooglePhotosButton({ max, maxSide = 1600, onPicked, className, children, wide = false }: {
  max: number; maxSide?: number; onPicked: (paths: string[]) => void; className?: string; children: React.ReactNode; wide?: boolean;
}) {
  const t = useTranslations("images.google");
  const [step, setStep] = useState<"idle" | "auth" | "waiting" | "importing">("idle");
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);

  useEffect(() => {
    if (GOOGLE_CLIENT_ID) loadGoogleScript().catch(() => {});
    return () => { stop.current = true; };
  }, []);
  if (!GOOGLE_CLIENT_ID) return null;

  const reset = () => { stop.current = true; setStep("idle"); setUri(null); };

  async function start() {
    setError(null);
    stop.current = false;
    setStep("auth");
    let token: string;
    try {
      token = await requestPhotosToken();
    } catch {
      setStep("idle");
      return setError(t("denied"));
    }
    const session = await startPhotoPicker(token, max);
    if (!session.ok) { setStep("idle"); return setError(t("failed")); }
    setUri(`${session.pickerUri}/autoclose`);
    setStep("waiting");
    const until = Date.now() + 10 * 60 * 1000;
    while (!stop.current && Date.now() < until) {
      await new Promise((r) => setTimeout(r, session.pollMs));
      if (stop.current) return;
      const state = await checkPhotoPicker(token, session.id);
      if (!state.ok) { setStep("idle"); return setError(t("failed")); }
      if (!state.done) continue;
      setStep("importing");
      const res = await importPickedPhotos(token, session.id, max, maxSide);
      setStep("idle");
      setUri(null);
      if (!res.ok) return setError(res.error === "empty" ? t("none") : t("failed"));
      return onPicked(res.paths);
    }
    if (!stop.current) { setStep("idle"); setUri(null); setError(t("timeout")); }
  }

  return (
    <div className={`flex flex-col gap-2 ${wide ? "w-full" : ""}`}>
      <button type="button" disabled={step !== "idle"} onClick={start} className={className}>{step === "idle" ? children : t(step === "importing" ? "importing" : "authorizing")}</button>
      {step === "waiting" && uri && (
        <div role="status" className="flex max-w-[360px] flex-col gap-2 border border-ink bg-surface p-3 text-sm">
          <span>{t("waiting")}</span>
          <div className="flex flex-wrap gap-2">
            <a href={uri} target="_blank" rel="noopener noreferrer" className={`${btn.primarySm}`}>{t("open")}</a>
            <button type="button" onClick={reset} className={`${btn.secondarySm}`}>{t("cancel")}</button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="m-0 text-sm font-bold">{error}</p>}
    </div>
  );
}
