import { getCurrentUser } from "@/lib/auth";
import {
  addMessage,
  createConversation,
  findUserById,
  getConversation,
  getUserPreferences,
  listEnabledSkills,
  listMessages,
  updateConversation,
} from "@/lib/db";
import { authHeaders, getProviderConfig } from "@/lib/llm";
import { callMcpTool, collectMcpTools, findMcpServer, type McpToolDef } from "@/lib/mcp";
import { WEB_SEARCH_TOOL, executeTool, getWebSearchConfig } from "@/lib/tools";
import type { ChatStreamEvent } from "@/lib/types";

interface ChatBody {
  conversationId?: unknown;
  message?: unknown;
  model?: unknown;
  systemPrompt?: unknown;
  temperature?: unknown;
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/*
 * Providers reject requests that exceed their context window, and a long chat can
 * grow without bound. Keep the newest turns within a fixed budget; the latest user
 * message is always included.
 */
const MAX_CONTEXT_MESSAGES = 40;
const MAX_CONTEXT_CHARS = 48_000;
const MAX_TOOL_ROUNDS = 3;

function trimHistory<T extends { content: string }>(history: T[]): T[] {
  const kept: T[] = [];
  let chars = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (kept.length >= MAX_CONTEXT_MESSAGES) break;
    if (kept.length > 0 && chars + message.content.length > MAX_CONTEXT_CHARS) break;
    kept.unshift(message);
    chars += message.content.length;
  }
  return kept;
}

/*
 * Some providers (e.g. Bedrock Mantle) reject any history whose roles do not
 * strictly alternate user/assistant and that does not start with a user turn.
 * A failed or aborted reply leaves two user messages in a row, and trimming can
 * leave a leading assistant turn, so merge same-role neighbours and drop leading
 * assistant turns before calling the provider.
 */
type ChatTurn = { role: "user" | "assistant"; content: string };

function normalizeTurns(history: Array<{ role: string; content: string }>): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of history) {
    if (message.role === "system") continue;
    const content = message.content.trim();
    if (!content) continue;
    const role = message.role === "assistant" ? "assistant" : "user";
    const previous = turns[turns.length - 1];
    if (previous && previous.role === role) {
      previous.content = `${previous.content}\n\n${content}`;
    } else {
      turns.push({ role, content });
    }
  }
  while (turns.length > 0 && turns[0].role === "assistant") turns.shift();
  return turns;
}

type OutgoingToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type OutgoingMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OutgoingToolCall[];
  tool_call_id?: string;
};

interface ProviderToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface CompletionResult {
  content: string;
  toolCalls: ProviderToolCall[];
}

function describeProviderError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.startsWith("Provider returned")) return error.message;
    if (error.message === "fetch failed") return "Could not reach the provider.";
    return `Could not reach the provider: ${error.message}`;
  }
  return "Could not reach the provider.";
}

function mcpToolToOpenAI(tool: McpToolDef) {
  return {
    type: "function",
    function: {
      name: tool.functionName,
      description: tool.description,
      parameters: tool.inputSchema ?? { type: "object", properties: {} },
    },
  };
}

/**
 * One streaming provider call. Text deltas are forwarded as they arrive; tool
 * calls are accumulated from the stream (OpenAI sends them incrementally) and
 * returned once the response ends.
 */
async function streamChatCompletion(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: OutgoingMessage[];
  temperature: number;
  tools?: unknown[];
  signal: AbortSignal;
  onDelta: (text: string) => void;
}): Promise<CompletionResult> {
  const { baseUrl, apiKey, model, messages, temperature, tools, signal, onDelta } = options;

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: true,
      ...(tools && tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
    }),
    signal,
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 400);
    throw new Error(`Provider returned ${upstream.status}${detail ? `: ${detail}` : ""}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const calls: ProviderToolCall[] = [];
  let buffer = "";
  let content = "";
  let finished = false;

  const mergeCall = (index: number, delta: Record<string, unknown>) => {
    const call = (calls[index] ??= { id: "", name: "", arguments: "" });
    if (typeof delta.id === "string" && delta.id) call.id = delta.id;
    const fn = delta.function as { name?: unknown; arguments?: unknown } | undefined;
    if (!fn) return;
    // The name arrives once; arguments arrive in fragments and must be concatenated.
    if (typeof fn.name === "string" && fn.name) call.name = fn.name;
    if (typeof fn.arguments === "string") call.arguments += fn.arguments;
  };

  while (!finished) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, "");
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");

      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      if (payload === "[DONE]") {
        finished = true;
        break;
      }

      let parsed: {
        choices?: Array<{
          delta?: { content?: unknown; tool_calls?: unknown };
          message?: { tool_calls?: unknown };
        }>;
        error?: { message?: string };
      };
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (parsed.error?.message) throw new Error(parsed.error.message);

      const choice = parsed.choices?.[0];
      const delta = choice?.delta;
      if (delta) {
        if (typeof delta.content === "string" && delta.content.length > 0) {
          content += delta.content;
          onDelta(delta.content);
        }
        if (Array.isArray(delta.tool_calls)) {
          for (const raw of delta.tool_calls) {
            if (!raw || typeof raw !== "object") continue;
            const item = raw as Record<string, unknown>;
            const index = typeof item.index === "number" ? item.index : calls.length;
            mergeCall(index, item);
          }
        }
      }

      // Providers that ignore stream:true send the finished message in one chunk.
      if (Array.isArray(choice?.message?.tool_calls)) {
        choice.message.tool_calls.forEach((raw, index) => {
          if (raw && typeof raw === "object") mergeCall(index, raw as Record<string, unknown>);
        });
      }
    }
  }

  return { content, toolCalls: calls.filter((call) => call.name) };
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const text = typeof body.message === "string" ? body.message.trim() : "";
  if (!text) return Response.json({ error: "Message cannot be empty." }, { status: 400 });
  if (text.length > 32_000) {
    return Response.json({ error: "Message is too long (32,000 character limit)." }, { status: 400 });
  }

  const dbUser = findUserById(user.id);
  if (!dbUser) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const preferences = getUserPreferences(dbUser);

  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  let conversation = conversationId ? getConversation(conversationId, user.id) : null;
  if (conversationId && !conversation) {
    return Response.json({ error: "Conversation not found." }, { status: 404 });
  }

  const model =
    (typeof body.model === "string" && body.model.trim().slice(0, 200)) ||
    conversation?.model ||
    preferences.defaultModel;

  const conversationPrompt = conversation?.systemPrompt?.trim() || null;
  const bodyPrompt =
    typeof body.systemPrompt === "string" ? body.systemPrompt.trim().slice(0, 8000) : null;
  // A prompt configured on the conversation wins. Otherwise the caller's current
  // preference is used, so changing the default still affects existing chats.
  const baseSystemPrompt = conversationPrompt ?? bodyPrompt ?? preferences.systemPrompt;

  const enabledSkills = listEnabledSkills();
  const skillsBlock =
    enabledSkills.length > 0
      ? `Skills — apply these when they are relevant:\n${enabledSkills
          .map((skill) => `### ${skill.title}\n${skill.instructions}`)
          .join("\n\n")}`
      : "";
  const systemPrompt = [baseSystemPrompt?.trim(), skillsBlock].filter(Boolean).join("\n\n");

  const temperature = clamp(body.temperature, 0, 2, preferences.temperature);
  const isNew = !conversation;

  if (!conversation) {
    conversation = createConversation({
      userId: user.id,
      title: text.slice(0, 80),
      model,
      // Chat-created conversations do not pin a prompt; they follow preferences.
      systemPrompt: null,
    });
  }

  const conversationSnapshot = conversation;
  addMessage(conversationSnapshot.id, "user", text);

  const history = listMessages(conversationSnapshot.id).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  const context = normalizeTurns(trimHistory(history));
  const messages: OutgoingMessage[] = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    ...context,
  ];

  const searchConfig = getWebSearchConfig();
  const mcpTools = await collectMcpTools();
  const toolSchemas = [
    ...(searchConfig.enabled ? [WEB_SEARCH_TOOL] : []),
    ...mcpTools.map(mcpToolToOpenAI),
  ];
  const customToolMap = new Map(mcpTools.map((tool) => [tool.functionName, tool]));

  const provider = getProviderConfig();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "conversation", conversation: conversationSnapshot });

      let content = "";
      let hadError = false;
      try {
        for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
          const result = await streamChatCompletion({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model,
            messages,
            temperature,
            tools: toolSchemas,
            signal: request.signal,
            onDelta: (delta) => {
              content += delta;
              send({ type: "delta", text: delta });
            },
          });

          if (result.toolCalls.length === 0) break;

          const callIds = result.toolCalls.map(
            (call, index) => call.id || `call_${round}_${index}`,
          );
          messages.push({
            role: "assistant",
            content: result.content || null,
            tool_calls: result.toolCalls.map((call, index) => ({
              id: callIds[index],
              type: "function",
              function: { name: call.name, arguments: call.arguments || "{}" },
            })),
          });

          for (const [index, call] of result.toolCalls.entries()) {
            let detail = call.arguments;
            try {
              const args = JSON.parse(call.arguments || "{}") as { query?: unknown };
              if (typeof args.query === "string" && args.query.trim()) detail = args.query;
            } catch {
              /* keep the raw arguments as the display detail */
            }

            send({ type: "tool", name: call.name, detail, status: "running" });

            let execution: { content: string; summary: string };
            if (call.name === "web_search") {
              execution = await executeTool(call.name, call.arguments);
            } else {
              const toolDef = customToolMap.get(call.name);
              if (!toolDef) {
                execution = { content: `Unknown custom tool: ${call.name}`, summary: "unknown tool" };
              } else {
                const server = findMcpServer(toolDef.serverId);
                if (!server) {
                  execution = { content: `Tool server not found: ${toolDef.serverName}`, summary: "missing server" };
                } else {
                  const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
                  const out = await callMcpTool(server, toolDef.name, args);
                  execution = {
                    content: out.content || (out.isError ? "Tool returned an error." : ""),
                    summary: out.isError ? "tool error" : "tool result",
                  };
                }
              }
            }

            send({
              type: "tool",
              name: call.name,
              detail,
              status: "done",
              summary: execution.summary,
            });
            messages.push({ role: "tool", tool_call_id: callIds[index], content: execution.content });
          }
        }
      } catch (error) {
        if (!request.signal.aborted) {
          hadError = true;
          send({ type: "error", message: describeProviderError(error) });
        }
      } finally {
        if (content.trim()) {
          const saved = addMessage(conversationSnapshot.id, "assistant", content);
          const patch: { title?: string; touch: boolean } = { touch: true };
          if (isNew || conversationSnapshot.title === "New chat") {
            patch.title = text.slice(0, 80);
          }
          updateConversation(conversationSnapshot.id, user.id, patch);
          send({
            type: "done",
            message: {
              id: saved.id,
              role: "assistant",
              content: saved.content,
              createdAt: saved.createdAt,
            },
          });
        } else if (!hadError) {
          send({ type: "error", message: "The provider returned an empty response." });
        }

        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
