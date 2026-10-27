"use client";
import { useEffect } from "react";
import { keepPages } from "@/lib/offline";

/** On a list: keeps the first items' pages on the device, so that what one is likely to open next is there without a connection. */
export function KeepPages({ hrefs }: { hrefs: string[] }) {
  const key = hrefs.join("\n");
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    const h = setTimeout(() => keepPages(key.split("\n").filter(Boolean).slice(0, 12)), 2500);
    return () => clearTimeout(h);
  }, [key]);
  return null;
}
