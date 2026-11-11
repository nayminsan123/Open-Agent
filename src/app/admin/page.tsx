import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getCurrentUser } from "@/lib/auth";
import { getProviderSettings, getWebSearchSettings, listSkills, listUsers } from "@/lib/db";

export const metadata = { title: "Admin · OpenAgent" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const settings = getProviderSettings();
  const search = getWebSearchSettings();

  return (
    <AdminDashboard
      currentUser={user}
      initialUsers={listUsers()}
      initialSettings={{
        baseUrl: settings.baseUrl,
        hasApiKey: settings.apiKey.length > 0,
        defaultModel: settings.defaultModel,
        allowSignup: settings.allowSignup,
      }}
      initialWebSearch={{
        enabled: search.enabled,
        url: search.url,
        hasApiKey: search.apiKey.length > 0,
      }}
      initialSkills={listSkills()}
    />
  );
}
