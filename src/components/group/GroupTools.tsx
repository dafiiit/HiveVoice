"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { setGroupTools } from "@/lib/actions/groups";
import { GROUP_TOOLS, type GroupTool } from "@/lib/group-tools";
import { useAction } from "../ui/Action";
import { Notice, Section } from "../ui/Page";

/** For admins: which tools this group has. Switching one off hides its tab; nothing in it is deleted. */
export function GroupTools({ slug, groupId, tools }: { slug: string; groupId: string; tools: GroupTool[] }) {
  const t = useTranslations("group.tools");
  const [on, setOn] = useState<GroupTool[]>(tools);
  const { run, pending, error } = useAction();
  const toggle = (k: GroupTool) => {
    const next = on.includes(k) ? on.filter((x) => x !== k) : [...on, k];
    setOn(next);
    run(() => setGroupTools(slug, groupId, next));
  };
  return (
    <Section id="tools" title={t("title")}>
      <p className="m-0 text-sm text-muted">{t("text")}</p>
      <div className="grid gap-2 @xl:grid-cols-2">
        {GROUP_TOOLS.map((k) => (
          <label key={k} className={`flex cursor-pointer items-start gap-3 border p-3 ${on.includes(k) ? "border-ink" : "border-line-strong"}`}>
            <input type="checkbox" checked={on.includes(k)} disabled={pending} onChange={() => toggle(k)} className="mt-0.5 h-5 w-5 flex-none accent-[var(--ink)]" />
            <span className="flex flex-col"><strong>{t(`items.${k}.name`)}</strong><span className="text-sm text-muted">{t(`items.${k}.text`)}</span></span>
          </label>
        ))}
      </div>
      <p className="m-0 text-sm text-muted">{t("always")}</p>
      {error && <Notice tone="error">{error}</Notice>}
    </Section>
  );
}
