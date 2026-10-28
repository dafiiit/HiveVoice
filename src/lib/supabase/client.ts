"use client";
import { createBrowserClient } from "@supabase/ssr";
import { cookieOptions } from "./options";
import { publicSupabaseUrl, supabaseKey } from "./config";

export function createSupabaseBrowser() {
  return createBrowserClient(publicSupabaseUrl(), supabaseKey(), {
    cookieOptions: { ...cookieOptions, secure: window.location.protocol === "https:" },
    auth: { experimental: { passkey: true } } as never,
  });
}
