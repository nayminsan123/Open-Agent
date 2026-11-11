import { getCurrentUser } from "@/lib/auth";
import { getWebSearchSettings } from "@/lib/db";
import { webSearch } from "@/lib/tools";

/**
 * Admin-only web search probe. Uses the draft URL/key from the form when given so
 * the search can be tested before saving; otherwise falls back to the saved
 * configuration.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") {
    return Response.json({ error: "Admin access required." }, { status: 403 });
  }

  let body: { query?: unknown; url?: unknown; apiKey?: unknown };
  try {
    body = (await request.json()) as { query?: unknown; url?: unknown; apiKey?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) return Response.json({ error: "Query is required." }, { status: 400 });

  const saved = getWebSearchSettings();
  const draftUrl = typeof body.url === "string" ? body.url.trim() : "";
  const url = draftUrl || saved.url;
  if (!url) return Response.json({ error: "Web search URL is not configured." }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) {
    return Response.json({ error: "Web search URL must start with http:// or https://." }, { status: 400 });
  }

  const typedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  // Reuse the stored key only for the URL it belongs to.
  const apiKey = typedKey || (url === saved.url ? saved.apiKey : "");

  const result = await webSearch(query, { enabled: true, url, apiKey });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
