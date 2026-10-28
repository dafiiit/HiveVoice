"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { calendarSettings } from "@/lib/actions/calendar";
import { ConfirmAction, useAction } from "../ui/Action";
import { CopyField } from "../ui/Copy";
import { Notice, Section } from "../ui/Page";
import { btn } from "../ui/styles";

/** Reminders a day and an hour before, and the secret address of one's calendar for other calendar apps. */
export function CalendarSettings({ origin, prefs }: { origin: string; prefs: { remind_day: boolean; remind_hour: boolean; feed_token: string } }) {
  const t = useTranslations("calendar.settings");
  const [p, setP] = useState(prefs);
  const { run, pending, error } = useAction();
  const save = (patch: { remindDay?: boolean; remindHour?: boolean; newToken?: boolean }) =>
    run(() => calendarSettings(patch), { refresh: false, onOk: (res) => { if (res.ok) setP(res.data); } });
  const url = `${origin}/api/calendar/${p.feed_token}.ics`;
  return (
    <Section title={t("title")}>
      {(["remindDay", "remindHour"] as const).map((k) => {
        const on = k === "remindDay" ? p.remind_day : p.remind_hour;
        return (
          <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" checked={on} disabled={pending} onChange={(e) => {
              setP((x) => ({ ...x, [k === "remindDay" ? "remind_day" : "remind_hour"]: e.target.checked }));
              save({ [k]: e.target.checked });
            }} className="h-6 w-6 flex-none accent-[var(--ink)]" />
            {t(k)}
          </label>
        );
      })}
      <span className="text-sm text-muted">{t("remindHint")}</span>
      <div className="flex flex-col gap-2 pt-2">
        <CopyField label={t("feed")} value={url} copyLabel={t("copy")} />
        <span className="text-sm text-muted">{t("feedHint")}</span>
        <span className="flex flex-wrap gap-2">
          <a href={url.replace(/^https?:/, "webcal:")} className={btn.secondarySm}>{t("webcal")}</a>
          <ConfirmAction label={t("renew")} question={t("renewConfirm")} variant="secondary" size="sm" disabled={pending} onConfirm={() => save({ newToken: true })} />
        </span>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </Section>
  );
}
