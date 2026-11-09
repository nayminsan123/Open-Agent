import { getProviderSettings } from "./db";
import type { ModelsResponse } from "./types";

export interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function getProviderConfig(): ProviderConfig {
  const settings = getProviderSettings();
  return {
    baseUrl: normalizeBaseUrl(settings.baseUrl),
    apiKey: settings.apiKey,
    defaultModel: settings.defaultModel,
  };
}

export function authHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

interface CacheEntry {
  at: number;
  response: ModelsResponse;
}

const modelCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;
// Failures are cached too, but briefly: a hanging provider must not make every
// page load wait for the full timeout again.
const ERROR_TTL_MS = 15_000;

function ttlFor(response: ModelsResponse) {
  return response.error ? ERROR_TTL_MS : CACHE_TTL_MS;
}

export async function listProviderModels(force = false): Promise<ModelsResponse> {
  const config = getProviderConfig();
  const cacheKey = `${config.baseUrl}|${config.apiKey ? "keyed" : "anon"}`;
  const cached = modelCache.get(cacheKey);
  if (!force && cached && Date.now() - cached.at < ttlFor(cached.response)) {
    return cached.response;
  }

  if (!config.baseUrl) {
    return { models: [], error: "Provider base URL is not configured." };
  }

  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      headers: authHeaders(config.apiKey),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      const result: ModelsResponse = {
        models: [],
        error: `Provider returned ${response.status}${detail ? `: ${detail}` : ""}`,
      };
      modelCache.set(cacheKey, { at: Date.now(), response: result });
      return result;
    }

    const data = (await response.json()) as { data?: Array<{ id?: string }> };
    const models = Array.from(
      new Set(
        (data.data ?? [])
          .map((model) => model.id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));

    const result: ModelsResponse = {
      models: models.length > 0 ? models : config.defaultModel ? [config.defaultModel] : [],
      error: models.length === 0 ? "The provider returned no models." : undefined,
    };
    modelCache.set(cacheKey, { at: Date.now(), response: result });
    return result;
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "The provider did not respond within 10 seconds."
        : error instanceof Error
          ? error.message
          : "Could not reach the provider.";
    const result: ModelsResponse = { models: config.defaultModel ? [config.defaultModel] : [], error: message };
    modelCache.set(cacheKey, { at: Date.now(), response: result });
    return result;
  }
}

export function clearModelCache() {
  modelCache.clear();
}
