import { getCurrentUser } from "@/lib/auth";
import { createSkill, listSkills } from "@/lib/db";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role !== "admin") {
    return { error: Response.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  return Response.json({ skills: listSkills() });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let body: { title?: unknown; instructions?: unknown; enabled?: unknown };
  try {
    body = (await request.json()) as { title?: unknown; instructions?: unknown; enabled?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
  if (!title) return Response.json({ error: "Skill title is required." }, { status: 400 });
  if (!instructions) {
    return Response.json({ error: "Skill instructions are required." }, { status: 400 });
  }

  const skill = createSkill({
    title,
    instructions,
    enabled: body.enabled === false ? false : true,
  });
  return Response.json({ skill }, { status: 201 });
}
