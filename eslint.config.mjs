import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-prod/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees of parallel sessions are checked in their own folder.
    ".claude/**",
    // Edge Functions run on Deno with their own imports.
    "supabase/functions/**",
  ]),
]);

export default eslintConfig;
