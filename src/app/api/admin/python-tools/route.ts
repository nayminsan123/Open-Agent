import path from "node:path";
import { getCurrentUser } from "@/lib/auth";
import { createMcpServer, listMcpServers } from "@/lib/db";
import {
  getPythonCommand,
  getPythonToolsDirectory,
  isPythonToolServer,
  listPythonToolScripts,
  toPythonToolServer,
} from "@/lib/python-tools";
import { listToolsForServer } from "@/lib/mcp";
import type { McpServer } from "@/lib/types";

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

  const servers = listMcpServers()
    .filter(isPythonToolServer)
    .map(toPythonToolServer);

  return Response.json({ servers, scripts: await listPythonToolScripts() });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let body: { name?: unknown; script?: unknown };
  try {
    body = (await request.json()) as { name?: unknown; script?: unknown };
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const script = typeof body.script === "string" ? body.script : "";
  if (!name || name.length > 120) {
    return Response.json({ error: "Enter a name up to 120 characters." }, { status: 400 });
  }
  if (!(await listPythonToolScripts()).includes(script)) {
    return Response.json({ error: "Choose an available Python script." }, { status: 400 });
  }

  const candidate: McpServer = {
    id: "python-tool-test",
    name,
    transport: "stdio",
    url: "",
    command: getPythonCommand(),
    args: [path.join(getPythonToolsDirectory(), script)],
    enabled: true,
    createdAt: Date.now(),
  };

  let tools: Array<{ name: string }>;
  try {
    tools = await listToolsForServer(candidate);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown startup error.";
    return Response.json(
      { error: `Could not start the Python MCP server: ${detail}` },
      { status: 502 },
    );
  }
  if (tools.length === 0) {
    return Response.json({ error: "The Python MCP server did not expose any tools." }, { status: 400 });
  }

  const server = createMcpServer({
    name,
    transport: "stdio",
    command: candidate.command,
    args: candidate.args,
  });
  return Response.json({ server: toPythonToolServer(server), tools: tools.map((tool) => tool.name) }, { status: 201 });
}
