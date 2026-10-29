import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/origin";

export async function POST() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", await getOrigin()), { status: 303 });
}
