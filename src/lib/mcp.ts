import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { listEnabledMcpServers } from "./db";
import type { McpServer } from "./types";

/**
 * Thin wrapper around the official MCP SDK that lets the chat route offer every
 * enabled MCP server's tools to the model and execute them.
 */

export interface McpToolDef {
  serverId: string;
  serverName: string;
  /** Original name on the MCP server. */
  name: string;
  /** Prefixed name exposed to the model (avoids collisions between servers). */
  functionName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const CLIENT_NAME = "openagent";
const CLIENT_VERSION = "0.1.0";

function slug(value: string): string {
  const slugged = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slugged || "server";
}

function buildTransport(server: McpServer) {
  if (server.transport === "stdio") {
    return new StdioClientTransport({
      command: server.command,
      args: server.args,
      stderr: "ignore",
    });
  }
  return new StreamableHTTPClientTransport(new URL(server.url));
}

async function withClient<T>(server: McpServer, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: CLIENT_NAME, version: CLIENT_VERSION }, { capabilities: {} });
  const transport = buildTransport(server);
  try {
    await client.connect(transport);
    return await run(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function listToolsForServer(server: McpServer): Promise<
  Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>
> {
  const result = await withClient(server, (client) => client.listTools());
  return result.tools;
}

function formatContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const item = block as Record<string, unknown>;
      if (item.type === "text") return String(item.text ?? "");
      if (item.type === "image") return `[image: ${String(item.mimeType ?? "image")}]`;
      if (item.type === "resource") {
        const resource = item.resource as { text?: unknown; uri?: unknown } | undefined;
        return String(resource?.text ?? resource?.uri ?? "");
      }
      return JSON.stringify(item);
    })
    .filter((text) => text.length > 0)
    .join("\n");
}

export async function callMcpTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: string; isError?: boolean }> {
  const result = await withClient(server, (client) =>
    client.callTool({ name: toolName, arguments: args }),
  );
  return { content: formatContent(result.content), isError: result.isError === true };
}

interface ToolCache {
  at: number;
  tools: McpToolDef[];
}

const toolCache = new Map<string, ToolCache>();
const CACHE_TTL_MS = 60_000;

function cacheKey(servers: McpServer[]): string {
  return servers
    .map((server) => `${server.id}:${server.url}:${server.command}:${server.args.join(",")}`)
    .join("|");
}

/** Collect the tools of every enabled MCP server, cached briefly. */
export async function collectMcpTools(): Promise<McpToolDef[]> {
  const servers = listEnabledMcpServers();
  if (servers.length === 0) return [];

  const key = cacheKey(servers);
  const cached = toolCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.tools;

  const tools: McpToolDef[] = [];
  for (const server of servers) {
    try {
      const serverTools = await listToolsForServer(server);
      for (const tool of serverTools) {
        tools.push({
          serverId: server.id,
          serverName: server.name,
          name: tool.name,
          functionName: `mcp_${slug(server.name)}_${slug(tool.name)}`,
          description: tool.description ?? "",
          inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
        });
      }
    } catch {
      // An unreachable server must not break the chat; its tools are simply absent.
    }
  }

  toolCache.set(key, { at: Date.now(), tools });
  return tools;
}

export function findMcpServer(id: string): McpServer | undefined {
  return listEnabledMcpServers().find((server) => server.id === id);
}
