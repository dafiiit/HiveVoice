"use client";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { removeFromGroup } from "@/lib/actions/share";
import type { RefCard, RefType } from "@/lib/refs";
import { RefCardView } from "./RefCardView";
import { btn } from "../ui/styles";

export type CollectionItem = { card: RefCard; note: string | null; byName: string | null; mine: boolean };

const ORDER: RefType[] = ["group", "listing", "resource", "task", "initiative"];

/** A group's collection, sorted by kind: subgroups first, then offers and requests, documents, tasks, initiatives. */
export function Collection({ groupId, items, canRemoveAll }: { groupId: string; items: CollectionItem[]; canRemoveAll: boolean }) {
  const t = useTranslations("refs");
  const [pending, start] = useTransition();
  return (
    <section className="flex flex-col gap-5">
      <p className="m-0 max-w-[680px]">{t("collection.intro")}</p>
      {items.length === 0 && <p className="m-0 text-muted">{t("collection.empty")}</p>}
      {ORDER.map((type) => {
        const list = items.filter((i) => i.card.type === type);
        if (!list.length) return null;
        return (
          <div key={type} className="flex flex-col gap-2">
            <h2 className="m-0 text-lg font-bold">{type === "group" ? t("collection.subgroups") : t(`types.${type}`)} · {list.length}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((i) => (
                <div key={i.card.id} className="flex flex-col gap-1">
                  <RefCardView card={i.card} />
                  <span className="flex flex-wrap gap-x-3 text-sm text-muted">
                    {i.note && <span className="text-ink">{i.note}</span>}
                    {i.byName && <span>{t("collection.by", { name: i.byName })}</span>}
                    {(i.mine || canRemoveAll) && (
                      <button type="button" disabled={pending} onClick={() => start(async () => { await removeFromGroup(groupId, { type: i.card.type, id: i.card.id }); })}
                        className={`${btn.linkMuted} text-sm`}>{t("collection.remove")}</button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
