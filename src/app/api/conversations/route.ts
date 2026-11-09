import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_MODEL } from "@/lib/defaults";
import { createConversation, findUserById, getUserPreferences, listConversations } from "@/lib/db";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ conversations: listConversations(user.id) });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { model?: unknown; systemPrompt?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  const row = findUserById(user.id);
  const preferences = row ? getUserPreferences(row) : null;
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim().slice(0, 200)
      : (preferences?.defaultModel ?? DEFAULT_MODEL);

  const conversation = createConversation({
    userId: user.id,
    title: "New chat",
    model,
    systemPrompt:
      typeof body.systemPrompt === "string" ? body.systemPrompt.slice(0, 8000) : null,
  });

  return Response.json({ conversation }, { status: 201 });
}
