import type { InputHTMLAttributes } from "react";
import { IconSearch } from "./Icons";
import { searchBox, searchInput } from "./styles";

/** The one search field (top bar, lists, filters): a box with the magnifier and a plain input inside. */
export function SearchField({ label, box = "sm", className = "", ...input }: { label: string; box?: "md" | "sm"; className?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`${searchBox(box)} ${className}`}>
      <IconSearch size={box === "md" ? 18 : 16} />
      <span className="sr-only">{label}</span>
      <input type="search" autoComplete="off" {...input} className={`${searchInput} ${box === "sm" ? "md:text-sm" : ""}`} />
    </label>
  );
}
