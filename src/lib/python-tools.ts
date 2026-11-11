import { readdir } from "node:fs/promises";
import path from "node:path";
import type { McpServer, PythonToolServer } from "./types";

const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*\.py$/;

export function getPythonToolsDirectory(): string {
  return (
    process.env.AGENT_PYTHON_TOOLS_DIR ||
    path.join(process.env.AGENT_DATA_DIR ?? path.join(process.cwd(), "data"), "python-tools")
  );
}

export function getPythonCommand(): string {
  return process.env.AGENT_PYTHON_COMMAND || "python3";
}

export async function listPythonToolScripts(): Promise<string[]> {
  try {
    const entries = await readdir(
      /*turbopackIgnore: true*/ getPythonToolsDirectory(),
      { withFileTypes: true },
    );
    return entries
      .filter((entry) => entry.isFile() && SCRIPT_NAME_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export function isPythonToolServer(server: McpServer): boolean {
  if (
    server.transport !== "stdio" ||
    server.command !== getPythonCommand() ||
    server.args.length !== 1
  ) {
    return false;
  }
  const scriptPath = server.args[0];
  return (
    path.dirname(path.resolve(scriptPath)) ===
      path.resolve(/*turbopackIgnore: true*/ getPythonToolsDirectory()) &&
    SCRIPT_NAME_PATTERN.test(path.basename(scriptPath))
  );
}

export function toPythonToolServer(server: McpServer): PythonToolServer {
  return {
    id: server.id,
    name: server.name,
    script: path.basename(server.args[0]),
    enabled: server.enabled,
    createdAt: server.createdAt,
  };
}
