import { getCurrentUser } from "@/lib/auth";
import { deleteMcpServer, listMcpServers, updateMcpServer } from "@/lib/db";
import { isPythonToolServer, toPythonToolServer } from "@/lib/python-tools";

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
  const current = listMcpServers().find((server) => server.id === id);
  if (!current || !isPythonToolServer(current)) {
    return Response.json({ error: "Python tool server not found." }, { status: 404 });
  }

  let body: { enabled?: unknown };
  try {
    body = (await request.json()) as { enabled?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "Enabled must be a boolean." }, { status: 400 });
  }

  const server = updateMcpServer(id, { enabled: body.enabled });
  if (!server) return Response.json({ error: "Python tool server not found." }, { status: 404 });
  return Response.json({ server: toPythonToolServer(server) });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const current = listMcpServers().find((server) => server.id === id);
  if (!current || !isPythonToolServer(current)) {
    return Response.json({ error: "Python tool server not found." }, { status: 404 });
  }
  if (!deleteMcpServer(id)) {
    return Response.json({ error: "Python tool server not found." }, { status: 404 });
  }
  return Response.json({ ok: true });
}
