"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { PythonToolServer } from "@/lib/types";
import { AlertIcon, CheckIcon, PlusIcon, RefreshIcon, TrashIcon } from "./icons";

export function PythonToolsCard({
  initialServers,
  initialScripts,
}: {
  initialServers: PythonToolServer[];
  initialScripts: string[];
}) {
  const [servers, setServers] = useState(initialServers);
  const [scripts, setScripts] = useState(initialScripts);
  const [name, setName] = useState("");
  const [script, setScript] = useState(initialScripts[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/python-tools");
      const data = (await response.json()) as {
        servers?: PythonToolServer[];
        scripts?: string[];
        error?: string;
      };
      if (!response.ok || !data.servers || !data.scripts) {
        throw new Error(data.error ?? "Could not load Python tools.");
      }
      setServers(data.servers);
      setScripts(data.scripts);
      setScript((current) => (data.scripts!.includes(current) ? current : (data.scripts![0] ?? "")));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Python tools.");
    } finally {
      setBusy(false);
    }
  };

  const addServer = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !script) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/admin/python-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, script }),
      });
      const data = (await response.json()) as {
        server?: PythonToolServer;
        tools?: string[];
        error?: string;
      };
      if (!response.ok || !data.server) {
        throw new Error(data.error ?? "Could not add the Python tool server.");
      }
      setServers((current) => [...current, data.server!]);
      setName("");
      setNotice(
        `Connected ${data.server.name}: ${(data.tools ?? []).join(", ")}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the Python tool server.");
    } finally {
      setBusy(false);
    }
  };

  const toggleServer = async (server: PythonToolServer) => {
    setBusyId(server.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/python-tools/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !server.enabled }),
      });
      const data = (await response.json()) as { server?: PythonToolServer; error?: string };
      if (!response.ok || !data.server) {
        throw new Error(data.error ?? "Could not update the Python tool server.");
      }
      setServers((current) =>
        current.map((item) => (item.id === server.id ? data.server! : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the Python tool server.");
    } finally {
      setBusyId(null);
    }
  };

  const removeServer = async (server: PythonToolServer) => {
    if (!window.confirm(`Remove the “${server.name}” Python tool server?`)) return;
    setBusyId(server.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/python-tools/${server.id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not remove the Python tool server.");
      setServers((current) => current.filter((item) => item.id !== server.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the Python tool server.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.015]">
      <div className="flex items-start gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
        <span className="mt-0.5 font-mono text-xs text-emerald-400/80">Py</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-medium text-zinc-100">Python tools</h2>
          <p className="mt-0.5 text-[11px] text-zinc-600">
            Register Python MCP servers from the mounted tools folder.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={busy}
          aria-label="Refresh Python scripts"
          className="rounded p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300 disabled:opacity-50"
        >
          <RefreshIcon className={`size-3.5 ${busy ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] text-rose-200">
            <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-[11px] text-emerald-200">
            <CheckIcon className="size-3.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        <p className="text-[10.5px] leading-relaxed text-zinc-500">
          Copy trusted <code className="font-mono text-zinc-300">.py</code> MCP server files to{" "}
          <code className="font-mono text-zinc-300">data/python-tools/</code> on the VPS, then
          refresh this list. Scripts run inside the app container as its non-root user.
        </p>

        <form onSubmit={addServer} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            placeholder="Tool server name"
            className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:outline-none"
          />
          <select
            value={script}
            onChange={(event) => setScript(event.target.value)}
            disabled={scripts.length === 0}
            className="min-w-0 rounded-lg border border-white/10 bg-[#0c100f] px-2.5 py-1.5 font-mono text-[11px] text-zinc-200 focus:border-emerald-400/30 focus:outline-none disabled:opacity-50"
          >
            {scripts.length === 0 ? (
              <option value="">No Python scripts found</option>
            ) : (
              scripts.map((file) => (
                <option key={file} value={file}>
                  {file}
                </option>
              ))
            )}
          </select>
          <button
            type="submit"
            disabled={busy || !name.trim() || !script}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-[11px] font-semibold text-[#04120c] transition hover:bg-emerald-300 disabled:opacity-50"
          >
            <PlusIcon className="size-3.5" />
            Add &amp; test
          </button>
        </form>

        {servers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[11px] text-zinc-600">
            No Python tools registered.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {servers.map((server) => (
              <li
                key={server.id}
                className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.02] px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11.5px] text-zinc-200">{server.name}</p>
                  <p className="truncate font-mono text-[10px] text-zinc-600">{server.script}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[9.5px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={server.enabled}
                    disabled={busyId === server.id}
                    onChange={() => void toggleServer(server)}
                    className="size-3 accent-emerald-400"
                  />
                  on
                </label>
                <button
                  type="button"
                  onClick={() => void removeServer(server)}
                  disabled={busyId === server.id}
                  aria-label={`Remove ${server.name}`}
                  className="rounded p-1 text-zinc-600 transition hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-40"
                >
                  <TrashIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
