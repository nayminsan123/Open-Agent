import { getCurrentUser } from "@/lib/auth";
import {
  addMessage,
  createConversation,
  findUserById,
  getConversation,
  getUserPreferences,
  listMessages,
  updateConversation,
} from "@/lib/db";
import { authHeaders, getProviderConfig } from "@/lib/llm";
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
  const systemPrompt = conversationPrompt ?? bodyPrompt ?? preferences.systemPrompt;

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
  const messages = systemPrompt
    ? [{ role: "system" as const, content: systemPrompt }, ...context]
    : context;

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
        const upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: authHeaders(provider.apiKey),
          body: JSON.stringify({ model, messages, temperature, stream: true }),
          signal: request.signal,
          cache: "no-store",
        });

        if (!upstream.ok || !upstream.body) {
          const detail = (await upstream.text().catch(() => "")).slice(0, 400);
          hadError = true;
          send({
            type: "error",
            message: `Provider returned ${upstream.status}${detail ? `: ${detail}` : ""}`,
          });
        } else {
          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let upstreamDone = false;

          while (!upstreamDone) {
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
                upstreamDone = true;
                break;
              }

              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: unknown } }>;
                  error?: { message?: string };
                };
                if (parsed.error?.message) {
                  hadError = true;
                  send({ type: "error", message: parsed.error.message });
                  continue;
                }
                const delta = parsed.choices?.[0]?.delta?.content;
                if (typeof delta === "string" && delta.length > 0) {
                  content += delta;
                  send({ type: "delta", text: delta });
                }
              } catch {
                /* ignore malformed upstream chunks */
              }
            }
          }
        }
      } catch (error) {
        if (!request.signal.aborted) {
          hadError = true;
          send({
            type: "error",
            message:
              error instanceof Error
                ? `Could not reach the provider: ${error.message}`
                : "Could not reach the provider.",
          });
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
