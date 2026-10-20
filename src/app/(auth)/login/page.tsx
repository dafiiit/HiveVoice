import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { getSession } from "@/lib/session";
import { lastLogin } from "@/lib/lastLogin";

export async function generateMetadata() {
  return { title: (await getTranslations("auth"))("login") };
}

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const target = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  // Already signed in on this device: straight to the content.
  const session = await getSession();
  if (session) redirect(session.profile.onboarded ? (target ?? "/connect") : "/onboarding");
  return <AuthForm mode="login" next={target} remembered={await lastLogin()} />;
}
