import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth/AuthForm";

export async function generateMetadata() {
  return { title: (await getTranslations("auth"))("signup") };
}

export default async function Signup({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={typeof next === "string" ? next : undefined} />;
}
