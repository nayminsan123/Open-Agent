import { getWebSearchSettings } from "./db";
import type { SearchResult } from "./types";

/**
 * Web search tool.
 *
 * The endpoint is configured by an administrator and can be either a SearXNG base
 * URL (the default) or a full URL template containing `{query}`. JSON answers from
 * SearXNG (`results`), Brave (`web.results`) and simple `items`/`data` APIs are
 * understood.
 */
const MAX_RESULTS = 5;
const SNIPPET_CHARS = 400;
const REQUEST_TIMEOUT_MS = 10_000;

export interface WebSearchConfig {
  enabled: boolean;
  url: string;
  apiKey: string;
}

export function getWebSearchConfig(): WebSearchConfig {
  const settings = getWebSearchSettings();
  return {
    enabled: settings.enabled,
    url: settings.url.trim(),
    apiKey: settings.apiKey,
  };
}

function searchEndpoint(baseUrl: string, query: string): string {
  const encoded = encodeURIComponent(query);
  if (baseUrl.includes("{query}")) return baseUrl.replace(/\{query\}/g, encoded);
  return `${baseUrl.replace(/\/+$/, "")}/search?q=${encoded}&format=json`;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function resultArray(payload: unknown): unknown[] | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (Array.isArray(root.results)) return root.results;
  const web = root.web;
  if (web && typeof web === "object" && Array.isArray((web as Record<string, unknown>).results)) {
    return (web as Record<string, unknown>).results as unknown[];
  }
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.data)) return root.data;
  return null;
}

function normalizeResults(payload: unknown): SearchResult[] {
  const items = resultArray(payload);
  if (!items) return [];

  const results: SearchResult[] = [];
  for (const raw of items.slice(0, MAX_RESULTS)) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const url = asString(item.url) || asString(item.link) || asString(item.href);
    const title = asString(item.title) || asString(item.name) || url;
    const snippet =
      asString(item.content) ||
      asString(item.description) ||
      asString(item.snippet) ||
      asString(item.summary);
    if (!url && !title) continue;
    results.push({ title: title.slice(0, 200), url, snippet: snippet.slice(0, SNIPPET_CHARS) });
  }
  return results;
}

export async function webSearch(
  query: string,
  override?: Partial<WebSearchConfig>,
): Promise<{ results: SearchResult[]; error?: string }> {
  const config = { ...getWebSearchConfig(), ...override };
  if (!config.enabled && !override) return { results: [], error: "Web search is not enabled." };
  if (!config.url) return { results: [], error: "Web search URL is not configured." };

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.apiKey) {
    // Bearer works for most gateways; Brave uses its own header.
    headers.Authorization = `Bearer ${config.apiKey}`;
    headers["X-Subscription-Token"] = config.apiKey;
  }

  try {
    const response = await fetch(searchEndpoint(config.url, query), {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      return {
        results: [],
        error: `Search provider returned ${response.status}${detail ? `: ${detail}` : ""}`,
      };
    }

    const results = normalizeResults(await response.json());
    return {
      results,
      error: results.length === 0 ? "The search provider returned no results." : undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "The search provider did not respond within 10 seconds."
        : error instanceof Error
          ? error.message
          : "Could not reach the search provider.";
    return { results: [], error: message };
  }
}

export const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "Search the public web for current information. Use it for news, prices, releases, documentation or any fact that may have changed recently.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query." },
      },
      required: ["query"],
    },
  },
} as const;

function formatResults(results: SearchResult[]): string {
  return results
    .map(
      (result, index) =>
        `${index + 1}. ${result.title}\n${result.url}${result.snippet ? `\n${result.snippet}` : ""}`,
    )
    .join("\n\n");
}

/** Run one tool call and return the text that goes back to the model. */
export async function executeTool(
  name: string,
  argumentsJson: string,
): Promise<{ content: string; summary: string }> {
  if (name !== "web_search") {
    return { content: `Unknown tool: ${name}`, summary: "unknown tool" };
  }

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(argumentsJson || "{}") as Record<string, unknown>;
  } catch {
    return { content: "The tool arguments were not valid JSON.", summary: "invalid arguments" };
  }

  const query = asString(args.query).trim();
  if (!query) return { content: "Missing search query.", summary: "missing query" };

  const { results, error } = await webSearch(query);
  if (results.length === 0) {
    return { content: `Search failed: ${error ?? "no results"}`, summary: error ?? "no results" };
  }
  return {
    content: formatResults(results),
    summary: `${results.length} result${results.length === 1 ? "" : "s"}`,
  };
}
