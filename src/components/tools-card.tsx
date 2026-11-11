"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { SearchResult, Skill, WebSearchSettingsView } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  AlertIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyIcon,
  PlusIcon,
  RefreshIcon,
  SparkIcon,
  TrashIcon,
} from "./icons";

export function ToolsCard({
  initialWebSearch,
  initialSkills,
}: {
  initialWebSearch: WebSearchSettingsView;
  initialSkills: Skill[];
}) {
  const [enabled, setEnabled] = useState(initialWebSearch.enabled);
  const [url, setUrl] = useState(initialWebSearch.url);
  const [apiKey, setApiKey] = useState("");
  const [hasApiKey, setHasApiKey] = useState(initialWebSearch.hasApiKey);
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);

  const [testQuery, setTestQuery] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string; results: SearchResult[] } | null
  >(null);

  const [skills, setSkills] = useState<Skill[]>(initialSkills);
  const [skillTitle, setSkillTitle] = useState("");
  const [skillInstructions, setSkillInstructions] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (message: string) => {
    setNotice(message);
    setError(null);
    window.setTimeout(() => setNotice(null), 3500);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webSearchEnabled: enabled,
          webSearchUrl: url,
          webSearchApiKey: apiKey.trim() || undefined,
          clearWebSearchApiKey: clearKey,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        webSearch?: WebSearchSettingsView;
      };
      if (!response.ok || !data.webSearch) {
        throw new Error(data.error ?? "Could not save web search settings.");
      }
      setHasApiKey(data.webSearch.hasApiKey);
      setApiKey("");
      setClearKey(false);
      flash("Web search settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save web search settings.");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    const query = testQuery.trim();
    if (!query) return;
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/web-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, url, apiKey: apiKey.trim() || undefined }),
      });
      const data = (await response.json()) as {
        results?: SearchResult[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      const results = data.results ?? [];
      setTestResult({
        ok: !data.error,
        message: data.error ?? `${results.length} result${results.length === 1 ? "" : "s"}`,
        results,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Search failed.",
        results: [],
      });
    } finally {
      setTesting(false);
    }
  };

  const addSkill = async (event: FormEvent) => {
    event.preventDefault();
    if (!skillTitle.trim() || !skillInstructions.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: skillTitle, instructions: skillInstructions }),
      });
      const data = (await response.json()) as { skill?: Skill; error?: string };
      if (!response.ok || !data.skill) throw new Error(data.error ?? "Could not add the skill.");
      setSkills((prev) => [...prev, data.skill!]);
      setSkillTitle("");
      setSkillInstructions("");
      flash("Skill added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the skill.");
    } finally {
      setAdding(false);
    }
  };

  const toggleSkill = async (skill: Skill) => {
    setBusyId(skill.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/skills/${skill.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !skill.enabled }),
      });
      const data = (await response.json()) as { skill?: Skill; error?: string };
      if (!response.ok || !data.skill) throw new Error(data.error ?? "Could not update the skill.");
      setSkills((prev) => prev.map((item) => (item.id === skill.id ? data.skill! : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the skill.");
    } finally {
      setBusyId(null);
    }
  };

  const removeSkill = async (skill: Skill) => {
    if (!window.confirm(`Delete the “${skill.title}” skill?`)) return;
    setBusyId(skill.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/skills/${skill.id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not delete the skill.");
      setSkills((prev) => prev.filter((item) => item.id !== skill.id));
      flash("Skill deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the skill.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.015]">
      <div className="flex items-start gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
        <span className="mt-0.5 text-emerald-400/80">
          <SparkIcon className="size-4" />
        </span>
        <div>
          <h2 className="text-[13px] font-medium text-zinc-100">Tools &amp; skills</h2>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Give the model a web search tool and reusable instructions it should follow.
          </p>
        </div>
      </div>

      <div className="space-y-6 p-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] text-rose-200">
            <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-[11px] text-emerald-200">
            <CheckIcon className="size-3.5" />
            {notice}
          </div>
        )}

        {/* ---------------------------------------------------------- web search */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <GlobeIcon className="size-4 text-emerald-400/80" />
            <h3 className="text-[12.5px] font-medium text-zinc-200">Web search</h3>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-[11px] text-zinc-400">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) => setEnabled(event.target.checked)}
                className="size-3.5 accent-emerald-400"
              />
              {enabled ? "enabled" : "disabled"}
            </label>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="searchUrl" className="text-[11px] font-medium text-zinc-400">
              Search URL
            </label>
            <input
              id="searchUrl"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://searxng.example.com  or  https://api.example.com/search?q={query}"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
            />
            <p className="text-[10px] leading-relaxed text-zinc-600">
              A SearXNG base URL is appended with <span className="font-mono">/search?q=…&amp;format=json</span>.
              Any URL containing <span className="font-mono">{"{query}"}</span> is called as-is.
            </p>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="searchKey" className="text-[11px] font-medium text-zinc-400">
                API key <span className="text-zinc-600">(optional)</span>
              </label>
              {hasApiKey && (
                <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                  <CheckIcon className="size-2.5" /> configured
                </span>
              )}
            </div>
            <div className="relative">
              <KeyIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                id="searchKey"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value);
                  setClearKey(false);
                }}
                placeholder={hasApiKey ? "Leave blank to keep the current key" : "optional"}
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pr-10 pl-9 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((value) => !value)}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                aria-label={showKey ? "Hide API key" : "Show API key"}
              >
                {showKey ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
              </button>
            </div>
            {hasApiKey && (
              <label className="flex w-fit items-center gap-2 pt-1 text-[10px] text-zinc-500">
                <input
                  type="checkbox"
                  checked={clearKey}
                  onChange={(event) => {
                    setClearKey(event.target.checked);
                    if (event.target.checked) setApiKey("");
                  }}
                  className="size-3 accent-emerald-400"
                />
                Remove the stored search key
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-emerald-400 px-3.5 py-1.5 text-[11px] font-semibold text-[#04120c] transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save search"}
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                value={testQuery}
                onChange={(event) => setTestQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void runTest();
                  }
                }}
                placeholder="test query"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={testing || !testQuery.trim()}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-50"
              >
                <RefreshIcon className={cn("size-3", testing && "animate-spin")} />
                {testing ? "searching…" : "Test"}
              </button>
            </div>
          </div>

          {testResult && (
            <div className="space-y-2 rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
              <p
                className={cn(
                  "font-mono text-[10px]",
                  testResult.ok ? "text-emerald-300" : "text-rose-300",
                )}
              >
                {testResult.message}
              </p>
              {testResult.results.map((result) => (
                <div key={result.url || result.title} className="text-[11px] leading-relaxed">
                  <a
                    href={result.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-emerald-300 underline decoration-emerald-400/30 underline-offset-2 hover:decoration-emerald-400"
                  >
                    {result.title}
                  </a>
                  {result.snippet && <p className="text-[10.5px] text-zinc-500">{result.snippet}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.06]" />

        {/* ------------------------------------------------------------- skills */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <SparkIcon className="size-4 text-emerald-400/80" />
            <h3 className="text-[12.5px] font-medium text-zinc-200">Skills</h3>
            <span className="ml-auto font-mono text-[9.5px] text-zinc-600">
              {skills.filter((skill) => skill.enabled).length}/{skills.length} active
            </span>
          </div>
          <p className="text-[10.5px] leading-relaxed text-zinc-600">
            Enabled skills are added to the system prompt of every chat.
          </p>

          <form onSubmit={addSkill} className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
            <input
              value={skillTitle}
              onChange={(event) => setSkillTitle(event.target.value)}
              placeholder="Skill title (e.g. “Write release notes”)"
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:outline-none"
            />
            <textarea
              value={skillInstructions}
              onChange={(event) => setSkillInstructions(event.target.value)}
              rows={3}
              placeholder="Instructions the model should follow…"
              className="w-full resize-y rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:outline-none"
            />
            <button
              type="submit"
              disabled={adding || !skillTitle.trim() || !skillInstructions.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-[11px] font-semibold text-[#04120c] transition hover:bg-emerald-300 disabled:opacity-50"
            >
              <PlusIcon className="size-3.5" />
              {adding ? "Adding…" : "Add skill"}
            </button>
          </form>

          {skills.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-zinc-600">
              No skills yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {skills.map((skill) => (
                <li
                  key={skill.id}
                  className="flex items-start gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11.5px] text-zinc-200">{skill.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-zinc-600">
                      {skill.instructions}
                    </p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-1 pt-0.5 text-[9.5px] text-zinc-500">
                    <input
                      type="checkbox"
                      checked={skill.enabled}
                      disabled={busyId === skill.id}
                      onChange={() => void toggleSkill(skill)}
                      className="size-3 accent-emerald-400"
                    />
                    on
                  </label>
                  <button
                    type="button"
                    onClick={() => void removeSkill(skill)}
                    disabled={busyId === skill.id}
                    className="rounded p-1 text-zinc-600 transition hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-40"
                    aria-label={`Delete ${skill.title}`}
                  >
                    <TrashIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
