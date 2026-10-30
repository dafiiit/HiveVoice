import { NextResponse, type NextRequest } from "next/server";
import { acceptReport, type Report } from "@/lib/report";
import { storeReports } from "@/lib/reportServer";

const MAX_BYTES = 16_000;
const MAX_BATCH = 20;
const MAX_PER_MINUTE = 30;
// Counted per server instance and forgotten after a minute; the address is not stored anywhere else.
const recent = new Map<string, { minute: number; count: number }>();

function tooMany(request: NextRequest) {
  const minute = Math.floor(Date.now() / 60_000);
  const key = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
  const seen = recent.get(key);
  if (seen?.minute === minute) return ++seen.count > MAX_PER_MINUTE;
  if (recent.size > 5000) recent.clear();
  recent.set(key, { minute, count: 1 });
  return false;
}

// Browsers send their errors and speed measurements here (src/components/Reporter.tsx); see docs/debugging.md.
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return new NextResponse(null, { status: 403 });
  if (tooMany(request)) return new NextResponse(null, { status: 429 });
  const text = await request.text();
  if (text.length > MAX_BYTES) return new NextResponse(null, { status: 413 });
  let items: unknown;
  try { items = JSON.parse(text); } catch { return new NextResponse(null, { status: 400 }); }
  if (!Array.isArray(items)) return new NextResponse(null, { status: 400 });
  const reports = items.slice(0, MAX_BATCH).map(acceptReport).filter((r): r is Report => r !== null);
  if (reports.length) await storeReports(reports);
  return new NextResponse(null, { status: 204 });
}
