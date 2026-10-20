import { NextResponse, type NextRequest } from "next/server";
import { sql, errorCode } from "@/lib/db";

// Link from the confirmation email for official responsibilities.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const target = new URL("/settings?tab=resp", request.nextUrl.origin);
  try {
    if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("invalid_token");
    await sql`select app.confirm_official_verification(${token})`;
    target.searchParams.set("verified", "1");
  } catch (e) {
    target.searchParams.set("error", errorCode(e));
  }
  return NextResponse.redirect(target);
}
