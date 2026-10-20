import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { getSession } from "@/lib/session";

export async function generateMetadata() {
  return { title: (await getTranslations("auth"))("signup") };
}

export default async function Signup({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  // Already signed in on this device: straight to the content.
  const session = await getSession();
  if (session) redirect(session.profile.onboarded ? (target ?? "/friends") : "/onboarding");
  return <AuthForm mode="signup" next={target} remembered={null} />;
}
