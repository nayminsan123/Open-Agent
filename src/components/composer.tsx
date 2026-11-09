"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { SendIcon, StopIcon } from "./icons";

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  placeholder,
  model,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
  placeholder: string;
  model: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [value]);

  const submit = () => {
    if (!value.trim() || streaming || disabled) return;
    onSend();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">
      <div
        className={cn(
          "rounded-2xl border border-white/10 bg-[#0c100f] shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)] transition",
          "focus-within:border-emerald-400/30 focus-within:ring-2 focus-within:ring-emerald-400/10",
        )}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="block max-h-45 w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[13.5px] leading-6 text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-60"
        />

        <div className="flex items-center gap-2 px-2.5 py-2">
          <span className="hidden max-w-[240px] items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[10px] text-zinc-500 sm:flex">
            <span className="size-1.5 shrink-0 rounded-full bg-emerald-400" />
            <span className="truncate">{model || "no model"}</span>
          </span>
          <span className="ml-auto hidden font-mono text-[10px] text-zinc-600 sm:inline">
            enter to send · shift+enter newline
          </span>

          {streaming ? (
            <button
              onClick={onStop}
              className="flex items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-400/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-300 transition hover:bg-rose-400/20"
            >
              <StopIcon className="size-3" />
              Stop
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim() || disabled}
              className={cn(
                "grid size-8 place-items-center rounded-lg transition active:scale-95",
                value.trim() && !disabled
                  ? "bg-emerald-400 text-[#04120c] hover:bg-emerald-300"
                  : "bg-white/[0.06] text-zinc-600",
              )}
              aria-label="Send message"
            >
              <SendIcon className="size-4" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 px-1 text-center font-mono text-[10px] text-zinc-600">
        Responses can be inaccurate. Verify important information.
      </p>
    </div>
  );
}
