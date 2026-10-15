import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/components/auth/AuthForm";

export async function generateMetadata() {
  return { title: (await getTranslations("auth"))("login") };
}

export default async function Login({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={typeof next === "string" ? next : undefined} />;
}
