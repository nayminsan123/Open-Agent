"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { cn, formatClock, initials } from "@/lib/utils";
import { CheckIcon, CopyIcon, SparkIcon } from "./icons";
import { Markdown } from "./markdown";

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="size-1.5 animate-bounce rounded-full bg-emerald-400/70"
          style={{ animationDelay: `${index * 120}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

export function ChatMessageItem({
  message,
  streaming,
  toolStatus,
  userName,
  modelName,
}: {
  message: ChatMessage;
  streaming?: boolean;
  toolStatus?: { name: string; detail: string; status: "running" | "done" | "error"; summary?: string } | null;
  userName: string;
  modelName: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (message.role === "user") {
    return (
      <div className="group flex justify-end gap-3">
        <div className="flex max-w-[85%] flex-col items-end gap-1.5 sm:max-w-[75%]">
          <div className="rounded-2xl rounded-br-md border border-emerald-400/20 bg-emerald-400/[0.09] px-4 py-2.5 text-[13.5px] leading-6 whitespace-pre-wrap text-emerald-50">
            {message.content}
          </div>
          <span className="pr-1 font-mono text-[10px] text-zinc-600">
            you · {formatClock(message.createdAt)}
          </span>
        </div>
        <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-[10px] font-medium text-zinc-400">
          {initials(userName)}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-[#04120c] shadow-[0_0_16px_-6px] shadow-emerald-500">
        <SparkIcon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-xs font-medium text-zinc-300">Assistant</span>
          <span className="max-w-[220px] truncate rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 font-mono text-[9px] tracking-wide text-zinc-500 uppercase">
            {modelName}
          </span>
          <span className="font-mono text-[10px] text-zinc-600">
            {formatClock(message.createdAt)}
          </span>
          {message.content && !streaming && (
            <button
              onClick={copy}
              className="ml-auto rounded p-1 text-zinc-600 opacity-0 transition hover:bg-white/5 hover:text-zinc-300 group-hover:opacity-100"
              aria-label="Copy reply"
            >
              {copied ? <CheckIcon className="size-3.5 text-emerald-400" /> : <CopyIcon className="size-3.5" />}
            </button>
          )}
        </div>

        {message.content ? (
          <div className="relative">
            <Markdown content={message.content} />
            {streaming && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-emerald-400 align-text-bottom" />
            )}
          </div>
        ) : (
          streaming && <TypingDots />
        )}

        {streaming && toolStatus && (
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-zinc-500">
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                toolStatus.status === "running" ? "animate-pulse bg-amber-400" : "bg-emerald-400",
              )}
            />
            <span className="truncate">
              {toolStatus.name === "web_search" ? `web search: ${toolStatus.detail}` : toolStatus.name}
              {toolStatus.summary ? ` · ${toolStatus.summary}` : ""}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
