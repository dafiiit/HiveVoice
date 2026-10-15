import { NextResponse, type NextRequest } from "next/server";
import { sql } from "@/lib/db";

// Closes due ballots and jury cases. On Supabase pg_cron does this every five
// minutes; self-hosted instances without pg_cron can call this endpoint.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [{ closed }] = await sql<{ closed: number }[]>`select app.tick() as closed`;
  return NextResponse.json({ closed });
}
