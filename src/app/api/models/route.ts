import { getCurrentUser } from "@/lib/auth";
import { listProviderModels } from "@/lib/llm";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const force = new URL(request.url).searchParams.get("refresh") === "1";
  const result = await listProviderModels(force);
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
