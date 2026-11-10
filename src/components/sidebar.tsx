"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Conversation, PublicUser } from "@/lib/types";
import { cn, groupConversations, initials, relativeTime } from "@/lib/utils";
import {
  ChevronRightIcon,
  LogOutIcon,
  MessageIcon,
  PlusIcon,
  SearchIcon,
  ShieldIcon,
  SparkIcon,
  TrashIcon,
  XIcon,
} from "./icons";

export function Sidebar({
  user,
  conversations,
  activeId,
  open,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onSignOut,
}: {
  user: PublicUser;
  conversations: Conversation[];
  activeId: string | null;
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-30 bg-black/60 backdrop-blur-sm transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-white/[0.07] bg-[#0a0d0c] transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center gap-2.5 px-4 pt-5 pb-4">
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-[#04120c] shadow-[0_0_18px_-4px] shadow-emerald-500/60">
            <SparkIcon className="size-4.5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-zinc-100">OpenAgent</p>
            <p className="font-mono text-[10px] text-zinc-500">AI workspace · self-hosted</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200 lg:hidden"
            aria-label="Close sidebar"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="space-y-2 px-3">
          <button
            onClick={onNew}
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-[13px] font-semibold text-[#04120c] transition hover:bg-emerald-300 active:scale-[0.99]"
          >
            <PlusIcon className="size-4 transition group-hover:rotate-90" />
            New chat
          </button>

          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 focus-within:border-white/20">
            <SearchIcon className="size-3.5 shrink-0 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              className="w-full bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="text-zinc-600 hover:text-zinc-300"
                aria-label="Clear search"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {groups.length === 0 && (
            <p className="px-2 py-8 text-center text-[11px] text-zinc-600">
              {query ? "No chats match your search." : "No chats yet. Start a conversation."}
            </p>
          )}

          {groups.map((group) => (
            <div key={group.label} className="mb-3">
              <p className="px-2 pt-2 pb-1 text-[10px] font-medium tracking-[0.14em] text-zinc-600 uppercase">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((conversation) => {
                  const active = conversation.id === activeId;
                  return (
                    <div
                      key={conversation.id}
                      className={cn(
                        "group relative flex items-center rounded-lg transition",
                        active
                          ? "bg-white/[0.06] text-zinc-100"
                          : "text-zinc-400 hover:bg-white/[0.035] hover:text-zinc-200",
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-emerald-400 transition-opacity",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <button
                        onClick={() => {
                          onSelect(conversation.id);
                          onClose();
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left"
                      >
                        <MessageIcon
                          className={cn(
                            "size-3.5 shrink-0",
                            active ? "text-emerald-300" : "text-zinc-600",
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px]">{conversation.title}</span>
                          <span className="mt-0.5 block font-mono text-[9px] text-zinc-600">
                            {relativeTime(conversation.updatedAt)}
                            {conversation.model ? ` · ${conversation.model}` : ""}
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          onDelete(conversation.id);
                        }}
                        className="mr-1.5 rounded p-1 text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-rose-400/10 hover:text-rose-300"
                        aria-label="Delete chat"
                        title="Delete chat"
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-white/[0.07] p-3">
          {user.role === "admin" && (
            <Link
              href="/admin"
              className="mb-2 flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-[11px] text-zinc-400 transition hover:border-emerald-400/25 hover:bg-emerald-400/[0.05] hover:text-emerald-200"
            >
              <ShieldIcon className="size-3.5 text-emerald-400/80" />
              Admin console
              <ChevronRightIcon className="ml-auto size-3.5 text-zinc-600" />
            </Link>
          )}

          <div className="flex items-center gap-2 rounded-lg px-1 py-1">
            <div className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-[11px] font-semibold text-zinc-300">
              {initials(user.name)}
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[12px] font-medium text-zinc-200">{user.name}</p>
              <p className="truncate font-mono text-[9px] text-zinc-600">{user.email}</p>
            </div>
            <button
              onClick={onSignOut}
              className="rounded p-1.5 text-zinc-600 transition hover:bg-rose-400/10 hover:text-rose-300"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOutIcon className="size-3.5" />
            </button>
          </div>

          <p className="mt-2 px-1 font-mono text-[9px] text-zinc-700">
            {user.role} · session secured
          </p>
        </div>
      </aside>
    </>
  );
}
