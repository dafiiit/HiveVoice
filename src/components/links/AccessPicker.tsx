"use client";
import { useTranslations } from "next-intl";
import { field } from "../ui/styles";

export type Access = { visibility: "me" | "group" | "link" | "public"; license: "all_rights" | "cc_by" | "cc_by_sa" | "cc0" };

/** Who sees a new document, and under which licence others may reuse it when it is public. */
export function AccessPicker({ value, onChange, inGroup }: { value: Access; onChange: (a: Access) => void; inGroup: boolean }) {
  const t = useTranslations("docrights");
  const options = (inGroup ? ["group", "me", "link", "public"] : ["public", "me", "link"]) as Access["visibility"][];
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="p-0 font-bold">{t("visibility.label")}</legend>
      <div className="flex flex-wrap gap-3">
        <select aria-label={t("visibility.label")} value={value.visibility} onChange={(e) => onChange({ ...value, visibility: e.target.value as Access["visibility"] })} className={`${field.select} h-11`}>
          {options.map((v) => <option key={v} value={v}>{t(`visibility.${v}`)}</option>)}
        </select>
        {value.visibility === "public" && (
          <select aria-label={t("license.label")} value={value.license} onChange={(e) => onChange({ ...value, license: e.target.value as Access["license"] })} className={`${field.select} h-11`}>
            {(["all_rights", "cc_by", "cc_by_sa", "cc0"] as const).map((l) => <option key={l} value={l}>{t(`license.${l}`)}</option>)}
          </select>
        )}
      </div>
      <span className={field.hint}>{t(`visibility.${value.visibility}Text` as "visibility.meText")}{value.visibility === "public" ? ` ${t("license.hint")}` : ""}</span>
    </fieldset>
  );
}
