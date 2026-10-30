import type { Instrumentation } from "next";

// Server errors stay readable after Vercel's short log window: they are counted with the browser reports (docs/debugging.md).
export const onRequestError: Instrumentation.onRequestError = async (error, _request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const digest = typeof error === "object" && error && "digest" in error ? String(error.digest) : "";
  if (digest.startsWith("NEXT_")) return; // redirects and "not found" travel as errors
  const { clean } = await import("@/lib/report");
  const { storeReports } = await import("@/lib/reportServer");
  const message = error instanceof Error ? error.message : String(error);
  await storeReports([{
    kind: "server-error",
    name: clean(message),
    path: context.routePath ?? context.routerKind,
    device: "server",
    detail: error instanceof Error && error.stack ? clean(error.stack, 2000) : null,
  }]);
};
