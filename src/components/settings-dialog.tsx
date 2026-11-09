"use client";

import { useEffect, useState } from "react";
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPERATURE } from "@/lib/defaults";
import type { UserPreferences } from "@/lib/types";
import { temperatureLabel } from "@/lib/utils";
import { AlertIcon, SparkIcon, XIcon } from "./icons";

const FALLBACK_MODEL = DEFAULT_MODEL;
const FALLBACK_PROMPT = DEFAULT_SYSTEM_PROMPT;

export function SettingsDialog({
  onClose,
  preferences,
  models,
  onSaved,
}: {
  onClose: () => void;
  preferences: UserPreferences;
  models: string[];
  onSaved: (preferences: UserPreferences) => void;
}) {
  const [model, setModel] = useState(preferences.defaultModel);
  const [systemPrompt, setSystemPrompt] = useState(preferences.systemPrompt);
  const [temperature, setTemperature] = useState(preferences.temperature);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultModel: model.trim() || FALLBACK_MODEL,
          systemPrompt,
          temperature,
        }),
      });
      const data = (await response.json()) as { preferences?: UserPreferences; error?: string };
      if (!response.ok || !data.preferences) {
        throw new Error(data.error ?? "Could not save settings.");
      }
      onSaved(data.preferences);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f0e] shadow-[0_30px_80px_-30px_rgba(0,0,0,1)]">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
          <SparkIcon className="size-4 text-emerald-400" />
          <div>
            <h2 id="settings-title" className="text-[13px] font-medium text-zinc-100">
              Chat settings
            </h2>
            <p className="font-mono text-[10px] text-zinc-600">defaults for new conversations</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-200"
            aria-label="Close settings"
          >
            <XIcon className="size-4" />
          </button>
        </div>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-300" htmlFor="default-model">
              Default model
            </label>
            <input
              id="default-model"
              list="settings-models"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={FALLBACK_MODEL}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
            />
            <datalist id="settings-models">
              {models.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            <p className="text-[10px] text-zinc-600">
              Used when you start a new chat. You can switch models per chat in the header.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-300" htmlFor="system-prompt">
              System prompt
            </label>
            <textarea
              id="system-prompt"
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
              rows={4}
              placeholder={FALLBACK_PROMPT}
              className="w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] leading-6 text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
            />
            <p className="text-[10px] text-zinc-600">
              Sent as the system message on every request. Leave blank for the provider default.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-zinc-300" htmlFor="temperature">
                Temperature
              </label>
              <span className="font-mono text-[10px] text-zinc-400">
                {temperature.toFixed(1)} · {temperatureLabel(temperature)}
              </span>
            </div>
            <input
              id="temperature"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
              className="w-full accent-emerald-400"
            />
            <div className="flex justify-between font-mono text-[9px] text-zinc-600">
              <span>precise</span>
              <span>balanced</span>
              <span>creative</span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] text-rose-200">
              <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/[0.07] px-4 py-3">
          <button
            onClick={() => {
              setModel(FALLBACK_MODEL);
              setSystemPrompt(FALLBACK_PROMPT);
              setTemperature(DEFAULT_TEMPERATURE);
            }}
            className="text-[11px] text-zinc-500 transition hover:text-zinc-300"
          >
            Restore defaults
          </button>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg border border-white/10 px-3 py-1.5 text-[11px] text-zinc-300 transition hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-emerald-400 px-3.5 py-1.5 text-[11px] font-semibold text-[#04120c] transition hover:bg-emerald-300 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

export { FALLBACK_MODEL, FALLBACK_PROMPT };
