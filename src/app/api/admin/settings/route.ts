import { getCurrentUser } from "@/lib/auth";
import { getProviderSettings, getWebSearchSettings, setSetting } from "@/lib/db";
import { clearModelCache } from "@/lib/llm";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role !== "admin") {
    return { error: Response.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { user };
}

function view() {
  const settings = getProviderSettings();
  const search = getWebSearchSettings();
  return {
    baseUrl: settings.baseUrl,
    hasApiKey: settings.apiKey.length > 0,
    defaultModel: settings.defaultModel,
    allowSignup: settings.allowSignup,
    webSearch: {
      enabled: search.enabled,
      url: search.url,
      hasApiKey: search.apiKey.length > 0,
    },
  };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  return Response.json(view());
}

export async function PUT(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let body: {
    baseUrl?: unknown;
    apiKey?: unknown;
    clearApiKey?: unknown;
    defaultModel?: unknown;
    allowSignup?: unknown;
    webSearchEnabled?: unknown;
    webSearchUrl?: unknown;
    webSearchApiKey?: unknown;
    clearWebSearchApiKey?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.baseUrl === "string") {
    const baseUrl = body.baseUrl.trim().replace(/\/+$/, "");
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
      return Response.json({ error: "Base URL must start with http:// or https://." }, { status: 400 });
    }
    setSetting("provider_base_url", baseUrl || "https://api.openai.com/v1");
  }

  if (body.clearApiKey === true) {
    setSetting("provider_api_key", "");
  } else if (typeof body.apiKey === "string" && body.apiKey.trim()) {
    setSetting("provider_api_key", body.apiKey.trim());
  }

  if (typeof body.defaultModel === "string") {
    setSetting("default_model", body.defaultModel.trim().slice(0, 200));
  }

  if (typeof body.allowSignup === "boolean") {
    setSetting("allow_signup", body.allowSignup ? "true" : "false");
  }

  if (typeof body.webSearchUrl === "string") {
    const url = body.webSearchUrl.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      return Response.json(
        { error: "Web search URL must start with http:// or https://." },
        { status: 400 },
      );
    }
    setSetting("web_search_url", url);
  }

  if (body.clearWebSearchApiKey === true) {
    setSetting("web_search_api_key", "");
  } else if (typeof body.webSearchApiKey === "string" && body.webSearchApiKey.trim()) {
    setSetting("web_search_api_key", body.webSearchApiKey.trim());
  }

  if (typeof body.webSearchEnabled === "boolean") {
    setSetting("web_search_enabled", body.webSearchEnabled ? "true" : "false");
  }

  clearModelCache();

  return Response.json(view());
}
