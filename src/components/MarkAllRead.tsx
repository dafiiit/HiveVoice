"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markAllRead } from "@/lib/actions/notifications";
import { btn } from "./ui/styles";

export function MarkAllRead({ label }: { label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button type="button" disabled={pending} onClick={() => start(async () => { await markAllRead(); router.refresh(); })} className={btn.secondarySm}>{label}</button>;
}
