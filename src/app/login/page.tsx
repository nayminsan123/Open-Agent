import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";
import { countUsers, getProviderSettings } from "@/lib/db";

export const metadata = { title: "Sign in · OpenAgent" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  const hasUsers = countUsers() > 0;
  const allowSignup = getProviderSettings().allowSignup;

  return <AuthForm hasUsers={hasUsers} allowSignup={allowSignup} />;
}
