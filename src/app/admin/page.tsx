import { redirect } from "next/navigation";
import { AdminDashboard } from "@/components/admin-dashboard";
import { getCurrentUser } from "@/lib/auth";
import {
  getProviderSettings,
  getWebSearchSettings,
  listMcpServers,
  listSkills,
  listUsers,
} from "@/lib/db";
import { isPythonToolServer, listPythonToolScripts, toPythonToolServer } from "@/lib/python-tools";

export const metadata = { title: "Admin · OpenAgent" };

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/");

  const settings = getProviderSettings();
  const search = getWebSearchSettings();
  const pythonServers = listMcpServers().filter(isPythonToolServer).map(toPythonToolServer);
  const pythonScripts = await listPythonToolScripts();

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
      initialPythonServers={pythonServers}
      initialPythonScripts={pythonScripts}
    />
  );
}
