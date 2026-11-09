"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, ChevronDownIcon, RefreshIcon, SearchIcon, SparkIcon } from "./icons";

export function ModelPicker({
  models,
  value,
  onChange,
  loading,
  error,
  onRefresh,
  disabled,
}: {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  loading: boolean;
  error?: string | null;
  onRefresh: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filtered = query.trim()
    ? models.filter((model) => model.toLowerCase().includes(query.trim().toLowerCase()))
    : models;

  const choose = (model: string) => {
    const next = model.trim();
    if (!next) return;
    onChange(next);
    setOpen(false);
    setQuery("");
    setCustom("");
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        disabled={disabled}
        className="flex max-w-[190px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50 sm:max-w-[260px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <SparkIcon className="size-3 shrink-0 text-emerald-400/80" />
        <span className="truncate font-mono text-[10px]">{value || "select model"}</span>
        <ChevronDownIcon className={cn("size-3 shrink-0 text-zinc-500 transition", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-white/10 bg-[#0c100f] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
            <span className="text-[10px] font-medium tracking-[0.14em] text-zinc-500 uppercase">
              Model
            </span>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="ml-auto rounded p-1 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200 disabled:opacity-40"
              aria-label="Refresh models"
            >
              <RefreshIcon className={cn("size-3.5", loading && "animate-spin")} />
            </button>
          </div>

          <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2">
            <SearchIcon className="size-3.5 shrink-0 text-zinc-600" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter models…"
              className="w-full bg-transparent text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
              autoFocus
            />
          </div>

          {error && (
            <p className="border-b border-white/[0.07] bg-rose-400/[0.06] px-3 py-2 text-[10px] leading-relaxed text-rose-300">
              {error}
            </p>
          )}

          <div className="max-h-56 overflow-y-auto p-1">
            {filtered.length === 0 && (
              <p className="px-2 py-4 text-center text-[11px] text-zinc-600">
                {models.length === 0 ? "No models found. Configure the provider in Admin." : "No match."}
              </p>
            )}
            {filtered.map((model) => (
              <button
                key={model}
                onClick={() => choose(model)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left font-mono text-[11px] transition",
                  model === value
                    ? "bg-emerald-400/10 text-emerald-200"
                    : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-200",
                )}
              >
                <span className="truncate">{model}</span>
                {model === value && <CheckIcon className="ml-auto size-3.5 shrink-0" />}
              </button>
            ))}
          </div>

          <div className="border-t border-white/[0.07] p-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1">
              <input
                value={custom}
                onChange={(event) => setCustom(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    choose(custom);
                  }
                }}
                placeholder="Use custom model id…"
                className="w-full bg-transparent font-mono text-[10px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
              />
              <button
                onClick={() => choose(custom)}
                disabled={!custom.trim()}
                className="rounded bg-emerald-400/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-400/25 disabled:opacity-40"
              >
                Use
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
