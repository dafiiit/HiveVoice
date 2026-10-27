"use client";
import { useTranslations } from "next-intl";
import { field } from "../ui/styles";
import type { Access } from "./AccessPicker";

type Group = { id: string; slug: string; name: string };

/** Where something goes when it is made: nowhere (only me), a group they belong to, everybody with the link, or everybody. */
export type Target = { where: string; license: Access["license"] };

export const targetFor = (groups: Group[], initialGroup: string | null): Target => {
  const g = groups.find((x) => x.slug === initialGroup);
  return { where: g ? `group:${g.id}` : "me", license: "all_rights" };
};

/** What the server needs: the group (if any) and the visibility to set afterwards. */
export const resolveTarget = (t: Target) =>
  t.where.startsWith("group:") ? { groupId: t.where.slice(6), visibility: "group" as const } : { groupId: null, visibility: t.where as "me" | "link" | "public" };

/** One question instead of two: "Wo teilen?", with "Nicht teilen" first. Public things also pick a licence (not for plain links). */
export function ShareTarget({ value, onChange, groups, license = true }: { value: Target; onChange: (v: Target) => void; groups: Group[]; license?: boolean }) {
  const t = useTranslations("links");
  const td = useTranslations("docrights");
  const kind = value.where.startsWith("group:") ? "group" : (value.where as "me" | "link" | "public");
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <label className={field.label}>{t("target.label")}
        <select value={value.where} onChange={(e) => onChange({ ...value, where: e.target.value })} className={`${field.select} h-11`}>
          <option value="me">{t("target.me")}</option>
          {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>{t("inGroup", { name: g.name })}</option>)}
          <option value="link">{t("target.link")}</option>
          <option value="public">{t("everyone")}</option>
        </select>
      </label>
      {kind === "public" && license && (
        <select aria-label={td("license.label")} value={value.license} onChange={(e) => onChange({ ...value, license: e.target.value as Access["license"] })} className={`${field.select} h-11 self-start`}>
          {(["all_rights", "cc_by", "cc_by_sa", "cc0"] as const).map((l) => <option key={l} value={l}>{td(`license.${l}`)}</option>)}
        </select>
      )}
      <span className={field.hint}>{kind === "group" ? td("visibility.groupText") : td(`visibility.${kind}Text` as "visibility.meText")}{kind === "public" && license ? ` ${td("license.hint")}` : ""}</span>
    </fieldset>
  );
}
