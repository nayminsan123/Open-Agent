import { getCurrentUser } from "@/lib/auth";
import { getProviderSettings } from "@/lib/db";
import { fetchModelsFor, normalizeBaseUrl } from "@/lib/llm";

/**
 * Admin-only model discovery for the settings form. It accepts the draft base URL
 * and API key the administrator is editing, so the fallback-model picker can be
 * populated before (or without) saving the configuration.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { baseUrl?: unknown; apiKey?: unknown };
  try {
    body = (await request.json()) as { baseUrl?: unknown; apiKey?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const saved = getProviderSettings();
  const savedBaseUrl = normalizeBaseUrl(saved.baseUrl);

  const draftBaseUrl =
    typeof body.baseUrl === "string" ? normalizeBaseUrl(body.baseUrl) : "";
  const baseUrl = draftBaseUrl || savedBaseUrl;
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
    return Response.json(
      { error: "Base URL must start with http:// or https://." },
      { status: 400 },
    );
  }

  const typedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  // Never hand the stored secret to a different host: it is only reused when the
  // administrator is still looking at the saved base URL.
  const apiKey = typedKey || (baseUrl === savedBaseUrl ? saved.apiKey : "");

  const result = await fetchModelsFor({ baseUrl, apiKey, defaultModel: saved.defaultModel });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
