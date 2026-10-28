"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { setChatTools } from "@/lib/actions/chat-tools";
import { GROUP_TOOLS, type GroupTool } from "@/lib/group-tools";
import { useAction } from "../ui/Action";
import { Popover } from "../ui/Popover";
import { IconPlus } from "../ui/Icons";

/**
 * "Werkzeuge" in a private chat: the same tools a group has (tasks, documents, goals …), switched on right here.
 * The chat stays a chat in the list; its tools appear as tabs next to "Chat".
 */
export function ChatTools({ conversationId, tools }: { conversationId: string; tools: GroupTool[] }) {
  const t = useTranslations("group.tools");
  const tc = useTranslations("connect");
  const [on, setOn] = useState<GroupTool[]>(tools);
  const { run, pending, error } = useAction();
  const toggle = (k: GroupTool) => {
    const next = on.includes(k) ? on.filter((x) => x !== k) : [...on, k];
    setOn(next);
    run(() => setChatTools(conversationId, next));
  };
  return (
    <Popover align="right" ariaLabel={tc("chatTools")} label={<><IconPlus size={14} /> <span className="max-sm:sr-only">{tc("chatTools")}</span></>}>
      <div className="flex flex-col gap-2" role="group" aria-label={t("title")}>
        <span className="text-[13px] text-muted">{tc("chatToolsText")}</span>
        {GROUP_TOOLS.map((k) => (
          <label key={k} className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" checked={on.includes(k)} disabled={pending} onChange={() => toggle(k)} className="mt-0.5 h-6 w-6 flex-none accent-[var(--ink)]" />
            <span className="flex flex-col"><span>{t(`items.${k}.name`)}</span><span className="text-xs text-muted">{t(`items.${k}.text`)}</span></span>
          </label>
        ))}
        {error && <span role="alert" className="text-sm font-bold">{error}</span>}
      </div>
    </Popover>
  );
}
