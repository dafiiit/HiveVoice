"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { GroupForm } from "./GroupForm";
import { InitiativeWizard } from "./InitiativeWizard";

type Place = { id: string; name: string; level: string };

/** One entry for everything people start together: first the purpose, then the matching form. */
export function NewGroupFlow({ chain, ideas, initial }: { chain: Place[]; ideas: string[]; initial: "project" | "demand" }) {
  const t = useTranslations("new.purpose");
  const [purpose, setPurpose] = useState(initial);
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="m-0 text-xl font-bold">{t("title")}</h2>
        <div role="radiogroup" aria-label={t("title")} className="grid max-w-[900px] grid-cols-1 gap-3 md:grid-cols-2">
          {(["project", "demand"] as const).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={purpose === k} onClick={() => setPurpose(k)}
              className={`flex flex-col items-start gap-1.5 bg-surface p-4 text-left text-ink border-2 ${purpose === k ? "border-ink" : "border-line-strong"}`}>
              <strong className="text-lg leading-tight">{t(`${k}.title`)}</strong>
              <span className="text-sm">{t(`${k}.text`)}</span>
            </button>
          ))}
        </div>
        <p className="m-0 max-w-[760px] text-sm text-muted">{t("later")}</p>
      </section>
      {purpose === "project" ? <GroupForm chain={chain} ideas={ideas} /> : <InitiativeWizard chain={chain} ideas={ideas} />}
    </div>
  );
}
