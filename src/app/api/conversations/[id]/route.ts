import { getCurrentUser } from "@/lib/auth";
import {
  deleteConversation,
  getConversation,
  listChatMessages,
  updateConversation,
} from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const conversation = getConversation(id, user.id);
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ conversation, messages: listChatMessages(conversation.id) });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: { title?: unknown; model?: unknown; systemPrompt?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: {
    title?: string;
    model?: string | null;
    systemPrompt?: string | null;
    touch?: boolean;
  } = {};

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return Response.json({ error: "Title cannot be empty." }, { status: 400 });
    patch.title = title.slice(0, 200);
  }
  if (typeof body.model === "string") patch.model = body.model.trim().slice(0, 200);
  if (body.model === null) patch.model = null;
  if (typeof body.systemPrompt === "string") patch.systemPrompt = body.systemPrompt.slice(0, 8000);
  if (body.systemPrompt === null) patch.systemPrompt = null;

  const conversation = updateConversation(id, user.id, { ...patch, touch: false });
  if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ conversation });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const deleted = deleteConversation(id, user.id);
  if (!deleted) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
