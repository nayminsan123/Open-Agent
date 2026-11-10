"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  ChatStreamEvent,
  Conversation,
  ModelsResponse,
  PublicUser,
  UserPreferences,
} from "@/lib/types";
import { cn, greeting } from "@/lib/utils";
import { ChatMessageItem } from "./chat-message";
import { Composer } from "./composer";
import {
  AlertIcon,
  MenuIcon,
  PlusIcon,
  SparkIcon,
  XIcon,
} from "./icons";
import { ModelPicker } from "./model-picker";
import { Sidebar } from "./sidebar";

function pickModel(preferred: string, models: string[]) {
  if (!preferred) return models[0] ?? "";
  if (models.length === 0 || models.includes(preferred)) return preferred;
  return models[0];
}

async function fetchModels(refresh = false): Promise<ModelsResponse> {
  const response = await fetch(`/api/models${refresh ? "?refresh=1" : ""}`);
  const data = (await response.json()) as ModelsResponse & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Could not load models.");
  return { models: data.models, error: data.error };
}

const STARTERS = [
  {
    title: "Explain some code",
    subtitle: "Paste a function and get a walkthrough",
    prompt: "Walk me through what this code does and point out any issues:\n\n",
  },
  {
    title: "Write unit tests",
    subtitle: "Generate tests for a function or module",
    prompt: "Write thorough unit tests for the following code:\n\n",
  },
  {
    title: "Debug an error",
    subtitle: "Trace a stack trace to its root cause",
    prompt: "Help me debug this error and suggest a fix:\n\n",
  },
  {
    title: "Draft an email",
    subtitle: "Turn rough notes into a polished message",
    prompt: "Draft a professional email about the following:\n\n",
  },
];

export function ChatApp({
  user,
  initialConversations,
  initialPreferences,
  initialActiveId,
  initialMessages,
  initialActiveModel,
}: {
  user: PublicUser;
  initialConversations: Conversation[];
  initialPreferences: UserPreferences;
  initialActiveId: string | null;
  initialMessages: ChatMessage[];
  initialActiveModel: string | null;
}) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(initialActiveId);
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [model, setModel] = useState(
    pickModel(initialActiveModel ?? initialPreferences.defaultModel, []),
  );
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);

  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const loadRequestRef = useRef(0);
  const router = useRouter();

  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;

  const applyModels = useCallback((data: ModelsResponse) => {
    setModels(data.models);
    setModelsError(data.error ?? null);
    setModel((current) => current || data.models[0] || "");
  }, []);

  const loadModels = useCallback(
    async (refresh = false) => {
      try {
        applyModels(await fetchModels(refresh));
      } catch (err) {
        setModelsError(err instanceof Error ? err.message : "Could not load models.");
      } finally {
        setModelsLoading(false);
      }
    },
    [applyModels],
  );

  // The model list is loaded in the browser so a slow or unreachable provider can
  // never hold up the first render of the workspace.
  useEffect(() => {
    let cancelled = false;
    fetchModels()
      .then((data) => {
        if (!cancelled) applyModels(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setModelsError(err instanceof Error ? err.message : "Could not load models.");
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyModels]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const openConversation = useCallback(
    async (id: string) => {
      if (streaming) abortRef.current?.abort();
      setSidebarOpen(false);
      setActiveId(id);
      setError(null);
      setInput("");
      setLoadingMessages(true);
      pinnedRef.current = true;
      const requestId = ++loadRequestRef.current;

      try {
        const response = await fetch(`/api/conversations/${id}`);
        const data = (await response.json()) as {
          conversation?: Conversation;
          messages?: ChatMessage[];
          error?: string;
        };
        if (requestId !== loadRequestRef.current) return;
        if (!response.ok || !data.conversation || !data.messages) {
          throw new Error(data.error ?? "Could not load this conversation.");
        }
        setMessages(data.messages);
        setModel(data.conversation.model || pickModel(initialPreferences.defaultModel, models));
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === data.conversation!.id ? data.conversation! : conversation,
          ),
        );
        window.history.replaceState(null, "", `/?c=${data.conversation.id}`);
      } catch (err) {
        if (requestId !== loadRequestRef.current) return;
        setMessages([]);
        setError(err instanceof Error ? err.message : "Could not load this conversation.");
      } finally {
        if (requestId === loadRequestRef.current) setLoadingMessages(false);
      }
    },
    [models, initialPreferences.defaultModel, streaming],
  );

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    loadRequestRef.current += 1;
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setLoadingMessages(false);
    setModel(pickModel(initialPreferences.defaultModel, models));
    setSidebarOpen(false);
    pinnedRef.current = true;
    window.history.replaceState(null, "", "/");
  }, [models, initialPreferences.defaultModel]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming || loadingMessages) return;

    const conversationId = activeId;
    setInput("");
    setError(null);
    setStreaming(true);
    pinnedRef.current = true;

    const stamp = Date.now();
    const assistantId = `local-assistant-${stamp}`;
    const userMessage: ChatMessage = {
      id: `local-user-${stamp}`,
      role: "user",
      content: text,
      createdAt: stamp,
    };
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: stamp + 1,
    };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    let createdConversation: Conversation | null = null;
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          conversationId,
          message: text,
          model,
          systemPrompt: initialPreferences.systemPrompt,
          temperature: initialPreferences.temperature,
        }),
      });

      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? `Request failed (${response.status}).`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;

      const handleEvent = (event: ChatStreamEvent) => {
        if (event.type === "conversation") {
          createdConversation = event.conversation;
          setActiveId(event.conversation.id);
          window.history.replaceState(null, "", `/?c=${event.conversation.id}`);
          setConversations((prev) => {
            const exists = prev.some((item) => item.id === event.conversation.id);
            if (exists) {
              return prev.map((item) =>
                item.id === event.conversation.id ? event.conversation : item,
              );
            }
            return [event.conversation, ...prev];
          });
          return;
        }

        if (event.type === "delta") {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + event.text }
                : message,
            ),
          );
          return;
        }

        if (event.type === "done") {
          setMessages((prev) =>
            prev.map((message) =>
              message.id === assistantId
                ? { ...message, id: event.message.id, createdAt: event.message.createdAt }
                : message,
            ),
          );
          return;
        }

        if (event.type === "error") {
          streamError = event.message;
          setError(event.message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line) as ChatStreamEvent);
          } catch {
            /* ignore malformed event */
          }
        }
      }

      if (!streamError) {
        setConversations((prev) =>
          prev
            .map((conversation) =>
              conversation.id === (createdConversation?.id ?? conversationId)
                ? {
                    ...conversation,
                    title:
                      conversation.title === "New chat" ? text.slice(0, 80) : conversation.title,
                    updatedAt: Date.now(),
                    model,
                  }
                : conversation,
            )
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
      }
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted) {
        setError(err instanceof Error ? err.message : "The request failed.");
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      setMessages((prev) =>
        prev.filter((message) => message.id !== assistantId || message.content.trim().length > 0),
      );
    }
  }, [activeId, initialPreferences, input, loadingMessages, model, streaming]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const changeModel = useCallback(
    (next: string) => {
      setModel(next);
      if (activeId) {
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === activeId ? { ...conversation, model: next } : conversation,
          ),
        );
        void fetch(`/api/conversations/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: next }),
        });
      }
    },
    [activeId],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      if (!window.confirm("Delete this chat? This cannot be undone.")) return;
      if (id === activeId && streaming) abortRef.current?.abort();
      try {
        const response = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error ?? "Could not delete the chat.");
        }
        setConversations((prev) => prev.filter((conversation) => conversation.id !== id));
        if (id === activeId) newChat();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete the chat.");
      }
    },
    [activeId, newChat, streaming],
  );

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }, [router]);

  const firstName = user.name.split(/\s+/)[0] || user.name;
  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-dvh overflow-hidden bg-[#070908] text-zinc-200">
      <Sidebar
        user={user}
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => void openConversation(id)}
        onNew={newChat}
        onDelete={(id) => void deleteConversation(id)}
        onSignOut={() => void signOut()}
      />

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(16,185,129,0.08),transparent_70%)]" />

        <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.07] bg-[#080b0a]/70 px-3 backdrop-blur sm:px-5">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-zinc-100 lg:hidden"
            aria-label="Open sidebar"
          >
            <MenuIcon className="size-4.5" />
          </button>

          <div className="min-w-0">
            <h1 className="max-w-[46vw] truncate text-[13px] font-medium text-zinc-200 sm:max-w-md">
              {activeConversation?.title ?? "New chat"}
            </h1>
            <p className="truncate font-mono text-[10px] text-zinc-600">
              {isEmpty
                ? `signed in as ${user.email}`
                : `${messages.length} message${messages.length === 1 ? "" : "s"}`}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <ModelPicker
              models={models}
              value={model}
              onChange={changeModel}
              loading={modelsLoading}
              error={modelsError}
              onRefresh={() => {
                setModelsLoading(true);
                void loadModels(true);
              }}
              disabled={streaming}
            />
            <button
              onClick={newChat}
              className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-zinc-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-zinc-100"
              aria-label="New chat"
              title="New chat"
            >
              <PlusIcon className="size-4" />
            </button>
          </div>
        </header>

        {error && (
          <div className="relative z-10 mx-auto mt-3 flex w-full max-w-3xl items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] leading-relaxed text-rose-200">
            <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">{error}</span>
            <button
              onClick={() => setError(null)}
              className="shrink-0 rounded p-0.5 text-rose-300/70 transition hover:bg-rose-400/10 hover:text-rose-200"
              aria-label="Dismiss error"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}

        <div
          ref={scrollRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
          }}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {loadingMessages ? (
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
              {[0, 1, 2].map((index) => (
                <div key={index} className="flex gap-3">
                  <div className="size-7 animate-pulse rounded-lg bg-white/[0.06]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-2.5 w-24 animate-pulse rounded bg-white/[0.06]" />
                    <div className="h-2.5 w-full animate-pulse rounded bg-white/[0.04]" />
                    <div className="h-2.5 w-3/4 animate-pulse rounded bg-white/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          ) : isEmpty ? (
            <div className="relative mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-10 text-center">
              <div className="grid-backdrop pointer-events-none absolute inset-0 -z-10" />
              <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-[#04120c] shadow-[0_0_40px_-8px] shadow-emerald-500/70">
                <SparkIcon className="size-7" />
              </div>
              <h2 className="mt-5 text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
                {greeting()}, {firstName}
              </h2>
              <p className="mt-2 max-w-md text-[13px] leading-6 text-zinc-500">
                How can I help today? Ask anything, switch models from the header, or start with
                one of these.
              </p>

              {models.length === 0 && !modelsLoading && (
                <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] text-amber-200/90">
                  {user.role === "admin"
                    ? "No models loaded yet. Add a provider base URL and API key in the Admin console."
                    : "No models are available yet. Ask an administrator to configure the provider."}
                </p>
              )}

              <div className="mt-6 grid w-full max-w-lg grid-cols-1 gap-2 text-left sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.title}
                    onClick={() => setInput(starter.prompt)}
                    className="group rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-left transition hover:border-emerald-400/25 hover:bg-emerald-400/[0.04]"
                  >
                    <p className="flex items-center gap-2 text-[12px] font-medium text-zinc-300 group-hover:text-zinc-100">
                      <SparkIcon className="size-3.5 text-emerald-400/70" />
                      {starter.title}
                    </p>
                    <p className="mt-1 text-[10.5px] leading-relaxed text-zinc-600">
                      {starter.subtitle}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-7 sm:px-6">
              <div className="flex justify-center">
                <span className="rounded-full border border-white/[0.07] bg-white/[0.02] px-3 py-1 font-mono text-[10px] text-zinc-600">
                  {model}
                </span>
              </div>
              {messages.map((message) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  streaming={streaming && message.role === "assistant" && message.id.startsWith("local-")}
                  userName={user.name}
                  modelName={model}
                />
              ))}
              <div className="h-1" />
            </div>
          )}
        </div>

        <div
          className={cn(
            "shrink-0 border-t border-white/[0.05] bg-gradient-to-t from-[#070908] via-[#070908]/95 to-transparent pt-3",
            isEmpty && "pt-1",
          )}
        >
          <Composer
            value={input}
            onChange={setInput}
            onSend={() => void send()}
            onStop={stop}
            streaming={streaming}
            disabled={loadingMessages}
            placeholder="Message the assistant…"
            model={model}
          />
        </div>
      </div>
    </div>
  );
}
