import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cookieOptions } from "./options";
import { serverSupabaseUrl, supabaseKey } from "./config";

export async function createSupabaseServer() {
  const store = await cookies();
  return createServerClient(serverSupabaseUrl(), supabaseKey(), {
    cookieOptions,
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
