import { getCurrentUser } from "@/lib/auth";
import { findUserById, getUserPreferences, saveUserPreferences } from "@/lib/db";
import type { UserPreferences } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const row = findUserById(user.id);
  if (!row) return Response.json({ error: "Unauthorized" }, { status: 401 });

  return Response.json({ user, preferences: getUserPreferences(row) });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const row = findUserById(user.id);
  if (!row) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<UserPreferences>;
  try {
    body = (await request.json()) as Partial<UserPreferences>;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const current = getUserPreferences(row);
  const next: UserPreferences = {
    defaultModel:
      typeof body.defaultModel === "string" && body.defaultModel.trim()
        ? body.defaultModel.trim().slice(0, 200)
        : current.defaultModel,
    systemPrompt:
      typeof body.systemPrompt === "string"
        ? body.systemPrompt.slice(0, 8000)
        : current.systemPrompt,
    temperature:
      typeof body.temperature === "number" && body.temperature >= 0 && body.temperature <= 2
        ? body.temperature
        : current.temperature,
  };

  saveUserPreferences(user.id, next);
  return Response.json({ preferences: next });
}
