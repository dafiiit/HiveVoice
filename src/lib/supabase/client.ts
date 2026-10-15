"use client";
import { createBrowserClient } from "@supabase/ssr";
import { cookieOptions } from "./options";

export function createSupabaseBrowser() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { ...cookieOptions, secure: window.location.protocol === "https:" },
    auth: { experimental: { passkey: true } } as never,
  });
}
