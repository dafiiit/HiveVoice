import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Directory } from "./Directory";
import { BackToList, Pick, Split } from "@/components/shell/Split";

type SP = Record<string, string | string[] | undefined>;

/** Gemeinschaft → Gruppen / Personen: the list with search and filters on the left, the opened group, initiative or person on the right. */
export async function DirectorySection({ area, sp, selected, detail }: { area: "groups" | "people"; sp: SP; selected?: string; detail?: ReactNode }) {
  const t = await getTranslations("community");
  const keep = new URLSearchParams(Object.entries(sp).filter(([k, v]) => typeof v === "string" && k !== "tab") as [string, string][]);
  return (
    <Split open={!!detail}
      list={
        <div className="flex flex-col gap-3 px-4 pt-4">
          <Directory sp={sp} area={area} selected={selected} title={t(`nav.${area}`)} />
        </div>
      }
      detail={detail
        ? <><BackToList href={`/community/${area}${keep.size ? `?${keep}` : ""}`} label={t(`nav.${area}`)} />{detail}</>
        : <Pick text={t(`${area}.lead`)} />} />
  );
}
