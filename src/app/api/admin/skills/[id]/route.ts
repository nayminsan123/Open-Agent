import { getCurrentUser } from "@/lib/auth";
import { deleteSkill, updateSkill } from "@/lib/db";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role !== "admin") {
    return { error: Response.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { user };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  let body: { title?: unknown; instructions?: unknown; enabled?: unknown };
  try {
    body = (await request.json()) as { title?: unknown; instructions?: unknown; enabled?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const patch: { title?: string; instructions?: string; enabled?: boolean } = {};
  if (typeof body.title === "string") {
    if (!body.title.trim()) return Response.json({ error: "Title cannot be empty." }, { status: 400 });
    patch.title = body.title.trim();
  }
  if (typeof body.instructions === "string") {
    if (!body.instructions.trim()) {
      return Response.json({ error: "Instructions cannot be empty." }, { status: 400 });
    }
    patch.instructions = body.instructions.trim();
  }
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;

  const skill = updateSkill(id, patch);
  if (!skill) return Response.json({ error: "Skill not found." }, { status: 404 });
  return Response.json({ skill });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (!deleteSkill(id)) return Response.json({ error: "Skill not found." }, { status: 404 });
  return Response.json({ ok: true });
}
