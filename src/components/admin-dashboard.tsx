"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { AdminUser, ProviderSettingsView, PublicUser, UserRole } from "@/lib/types";
import { cn, formatDate, initials } from "@/lib/utils";
import {
  AlertIcon,
  ArrowLeftIcon,
  CheckIcon,
  EyeIcon,
  EyeOffIcon,
  GlobeIcon,
  KeyIcon,
  PlusIcon,
  RefreshIcon,
  ShieldIcon,
  SparkIcon,
  TrashIcon,
  UsersIcon,
} from "./icons";

function Card({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.015]">
      <div className="flex items-start gap-3 border-b border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
        <span className="mt-0.5 text-emerald-400/80">{icon}</span>
        <div>
          <h2 className="text-[13px] font-medium text-zinc-100">{title}</h2>
          <p className="mt-0.5 text-[11px] text-zinc-600">{description}</p>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function AdminDashboard({
  currentUser,
  initialUsers,
  initialSettings,
}: {
  currentUser: PublicUser;
  initialUsers: AdminUser[];
  initialSettings: ProviderSettingsView;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [baseUrl, setBaseUrl] = useState(initialSettings.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [clearKey, setClearKey] = useState(false);
  const [defaultModel, setDefaultModel] = useState(initialSettings.defaultModel);
  const [allowSignup, setAllowSignup] = useState(initialSettings.allowSignup);
  const [hasApiKey, setHasApiKey] = useState(initialSettings.hasApiKey);

  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState(false);

  const [savingSettings, setSavingSettings] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [newUser, setNewUser] = useState({ name: "", email: "", password: "", role: "user" as UserRole });
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flash = (message: string) => {
    setNotice(message);
    setError(null);
    window.setTimeout(() => setNotice(null), 3500);
  };

  // Ask the provider for its model list using the values currently in the form, so
  // the fallback model can be picked before (or without) saving the settings.
  const loadModelList = useCallback(async () => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const response = await fetch("/api/admin/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, apiKey: apiKey.trim() || undefined }),
      });
      const data = (await response.json()) as { models?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load models.");
      setModels(data.models ?? []);
      setModelsError(data.error ?? null);
    } catch (err) {
      setModels([]);
      setModelsError(err instanceof Error ? err.message : "Could not load models.");
    } finally {
      setModelsLoading(false);
    }
  }, [apiKey, baseUrl]);

  // Load the current (saved) provider's list once when the page opens.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: initialSettings.baseUrl }),
    })
      .then(async (response) => ({
        ok: response.ok,
        data: (await response.json()) as { models?: string[]; error?: string },
      }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        setModels(ok ? (data.models ?? []) : []);
        setModelsError(data.error ?? (ok ? null : "Could not load models."));
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setModels([]);
          setModelsError(err instanceof Error ? err.message : "Could not load models.");
        }
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialSettings.baseUrl]);

  const saveSettings = async () => {
    setSavingSettings(true);
    setError(null);
    setTestResult(null);
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl,
          apiKey: apiKey.trim() || undefined,
          clearApiKey: clearKey,
          defaultModel,
          allowSignup,
        }),
      });
      const data = (await response.json()) as ProviderSettingsView & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save settings.");
      setHasApiKey(data.hasApiKey);
      setApiKey("");
      setClearKey(false);
      flash("Provider settings saved.");
      void loadModelList();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const response = await fetch("/api/models?refresh=1");
      const data = (await response.json()) as { models?: string[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Connection test failed.");
      setTestResult({
        ok: !data.error,
        message: data.error
          ? data.error
          : `Connected — ${data.models?.length ?? 0} model${data.models?.length === 1 ? "" : "s"} available.`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Connection test failed.",
      });
    } finally {
      setTesting(false);
    }
  };

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const data = (await response.json()) as { user?: PublicUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? "Could not create the user.");
      setUsers((prev) => [...prev, { ...data.user!, conversationCount: 0 }]);
      setNewUser({ name: "", email: "", password: "", role: "user" });
      flash(`Created ${data.user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the user.");
    } finally {
      setCreating(false);
    }
  };

  const changeRole = async (id: string, role: UserRole) => {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not update the role.");
      setUsers((prev) => prev.map((user) => (user.id === id ? { ...user, role } : user)));
      flash("Role updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the role.");
    } finally {
      setBusyId(null);
    }
  };

  const resetPassword = async (user: AdminUser) => {
    const password = window.prompt(`New password for ${user.email} (at least 8 characters):`);
    if (!password) return;
    setBusyId(user.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not reset the password.");
      flash(`Password reset for ${user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
    } finally {
      setBusyId(null);
    }
  };

  const removeUser = async (user: AdminUser) => {
    if (!window.confirm(`Delete ${user.email}? Their conversations will be removed too.`)) return;
    setBusyId(user.id);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not delete the user.");
      setUsers((prev) => prev.filter((item) => item.id !== user.id));
      flash(`Deleted ${user.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the user.");
    } finally {
      setBusyId(null);
    }
  };

  // Keep a saved model selectable even when the provider no longer reports it.
  const modelChoices =
    defaultModel && !models.includes(defaultModel) ? [defaultModel, ...models] : models;

  return (
    <div className="min-h-dvh bg-[#070908]">
      <header className="border-b border-white/[0.07] bg-[#080b0a]/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-[#04120c]">
            <SparkIcon className="size-4" />
          </div>
          <div className="leading-tight">
            <p className="text-[12.5px] font-semibold text-zinc-100">OpenAgent</p>
            <p className="font-mono text-[9px] text-zinc-600">admin console</p>
          </div>

          <Link
            href="/"
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06]"
          >
            <ArrowLeftIcon className="size-3.5" />
            Back to chat
          </Link>
          <div className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 sm:flex">
            <span className="grid size-5 place-items-center rounded-full bg-white/[0.08] text-[9px] font-semibold text-zinc-300">
              {initials(currentUser.name)}
            </span>
            <span className="font-mono text-[10px] text-zinc-400">{currentUser.email}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-7 sm:px-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-100">Admin console</h1>
          <p className="mt-1 text-[12px] text-zinc-500">
            Configure the model provider and manage who can use this workspace.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] text-rose-200">
            <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-rose-300/70 hover:text-rose-200">
              ✕
            </button>
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-[11px] text-emerald-200">
            <CheckIcon className="size-3.5" />
            {notice}
          </div>
        )}

        <Card
          icon={<GlobeIcon className="size-4" />}
          title="Model provider"
          description="Any OpenAI-compatible endpoint, including Ollama and LM Studio."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="baseUrl" className="text-[11px] font-medium text-zinc-400">
                Base URL
              </label>
              <input
                id="baseUrl"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <div className="flex items-center justify-between">
                <label htmlFor="apiKey" className="text-[11px] font-medium text-zinc-400">
                  API key
                </label>
                {hasApiKey ? (
                  <span className="flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300">
                    <CheckIcon className="size-2.5" /> configured
                  </span>
                ) : (
                  <span className="font-mono text-[9px] text-zinc-600">not set — optional for local providers</span>
                )}
              </div>
              <div className="relative">
                <KeyIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-zinc-600" />
                <input
                  id="apiKey"
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(event) => {
                    setApiKey(event.target.value);
                    setClearKey(false);
                  }}
                  placeholder={hasApiKey ? "Leave blank to keep the current key" : "sk-…"}
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
                  Remove the stored API key
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="defaultModel" className="text-[11px] font-medium text-zinc-400">
                  Fallback model
                </label>
                <button
                  type="button"
                  onClick={() => void loadModelList()}
                  disabled={modelsLoading}
                  title="Load the model list from the provider"
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300 disabled:opacity-40"
                >
                  <RefreshIcon className={cn("size-3", modelsLoading && "animate-spin")} />
                  {modelsLoading
                    ? "loading…"
                    : models.length > 0
                      ? `${models.length} models`
                      : "load models"}
                </button>
              </div>

              {models.length > 0 && !customModel ? (
                <select
                  id="defaultModel"
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-[#0c100f] px-2 py-2 font-mono text-[11px] text-zinc-200 focus:border-emerald-400/30 focus:outline-none"
                >
                  <option value="" disabled>
                    Select a model…
                  </option>
                  {modelChoices.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="defaultModel"
                  list="admin-model-options"
                  value={defaultModel}
                  onChange={(event) => setDefaultModel(event.target.value)}
                  placeholder={models[0] ?? "gpt-4o-mini"}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
                />
              )}
              <datalist id="admin-model-options">
                {models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>

              {models.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCustomModel((value) => !value)}
                  className="text-[9.5px] text-zinc-500 underline decoration-white/20 underline-offset-2 transition hover:text-zinc-300"
                >
                  {customModel ? "Pick from the provider list" : "Use a custom model id"}
                </button>
              )}

              {modelsError ? (
                <p className="text-[10px] leading-relaxed text-rose-300/80">{modelsError}</p>
              ) : models.length > 0 && defaultModel && !models.includes(defaultModel) ? (
                <p className="text-[10px] leading-relaxed text-amber-300/80">
                  This model is not in the provider list — pick one above.
                </p>
              ) : (
                <p className="text-[10px] leading-relaxed text-zinc-600">
                  The list comes from {"{Base URL}"}/models; refresh it after changing the URL or
                  key.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-zinc-400">Open sign-ups</span>
              <label className="flex h-[38px] cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-3">
                <input
                  type="checkbox"
                  checked={allowSignup}
                  onChange={(event) => setAllowSignup(event.target.checked)}
                  className="size-3.5 accent-emerald-400"
                />
                <span className="text-[11px] text-zinc-400">
                  {allowSignup ? "Anyone can create an account" : "Admin invites only"}
                </span>
              </label>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void saveSettings()}
              disabled={savingSettings}
              className="rounded-lg bg-emerald-400 px-3.5 py-1.5 text-[11px] font-semibold text-[#04120c] transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
            <button
              onClick={() => void testConnection()}
              disabled={testing}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] disabled:opacity-60"
            >
              <RefreshIcon className={cn("size-3.5", testing && "animate-spin")} />
              {testing ? "Testing…" : "Test connection"}
            </button>
            {testResult && (
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px]",
                  testResult.ok
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-rose-400/10 text-rose-300",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    testResult.ok ? "bg-emerald-400" : "bg-rose-400",
                  )}
                />
                {testResult.message}
              </span>
            )}
          </div>
        </Card>

        <Card
          icon={<UsersIcon className="size-4" />}
          title="Users"
          description={`${users.length} account${users.length === 1 ? "" : "s"} on this instance.`}
        >
          <form onSubmit={createUser} className="grid gap-2 sm:grid-cols-[1fr_1.2fr_1fr_auto_auto]">
            <input
              value={newUser.name}
              onChange={(event) => setNewUser({ ...newUser, name: event.target.value })}
              placeholder="Name"
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:outline-none"
            />
            <input
              value={newUser.email}
              onChange={(event) => setNewUser({ ...newUser, email: event.target.value })}
              placeholder="Email"
              type="email"
              required
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:outline-none"
            />
            <input
              value={newUser.password}
              onChange={(event) => setNewUser({ ...newUser, password: event.target.value })}
              placeholder="Password (8+ chars)"
              type="text"
              required
              className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[11px] text-zinc-200 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:outline-none"
            />
            <select
              value={newUser.role}
              onChange={(event) =>
                setNewUser({ ...newUser, role: event.target.value as UserRole })
              }
              className="rounded-lg border border-white/10 bg-[#0c100f] px-2 py-1.5 text-[11px] text-zinc-300 focus:border-emerald-400/30 focus:outline-none"
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
            <button
              type="submit"
              disabled={creating}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-[11px] font-semibold text-[#04120c] transition hover:bg-emerald-300 disabled:opacity-60"
            >
              <PlusIcon className="size-3.5" />
              {creating ? "Adding…" : "Add"}
            </button>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.07] font-mono text-[9px] tracking-wider text-zinc-600 uppercase">
                  <th className="py-2 pr-3 font-normal">User</th>
                  <th className="px-2 py-2 font-normal">Role</th>
                  <th className="px-2 py-2 font-normal">Chats</th>
                  <th className="px-2 py-2 font-normal">Joined</th>
                  <th className="py-2 pl-2 text-right font-normal">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-[10px] font-semibold text-zinc-300">
                          {initials(user.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-[11.5px] text-zinc-200">
                            <span className="max-w-[160px] truncate">{user.name}</span>
                            {user.id === currentUser.id && (
                              <span className="rounded bg-emerald-400/10 px-1 py-0.5 font-mono text-[8px] text-emerald-300">
                                you
                              </span>
                            )}
                          </span>
                          <span className="block max-w-[220px] truncate font-mono text-[9.5px] text-zinc-600">
                            {user.email}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <select
                        value={user.role}
                        disabled={user.id === currentUser.id || busyId === user.id}
                        onChange={(event) =>
                          void changeRole(user.id, event.target.value as UserRole)
                        }
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 font-mono text-[9.5px] focus:outline-none",
                          user.role === "admin"
                            ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-white/[0.04] text-zinc-400",
                        )}
                      >
                        <option value="user">user</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[10px] text-zinc-500">
                      {user.conversationCount}
                    </td>
                    <td className="px-2 py-2.5 font-mono text-[10px] text-zinc-500">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="py-2.5 pl-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => void resetPassword(user)}
                          disabled={busyId === user.id}
                          className="rounded border border-white/10 px-1.5 py-0.5 text-[9.5px] text-zinc-400 transition hover:border-white/20 hover:text-zinc-200 disabled:opacity-40"
                        >
                          Reset password
                        </button>
                        <button
                          onClick={() => void removeUser(user)}
                          disabled={user.id === currentUser.id || busyId === user.id}
                          className="rounded p-1 text-zinc-600 transition hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-30"
                          aria-label={`Delete ${user.email}`}
                        >
                          <TrashIcon className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.015] px-4 py-3 text-[10.5px] leading-relaxed text-zinc-600">
          <ShieldIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-400/60" />
          <p>
            API keys are stored server-side in SQLite and never sent to browsers. Passwords are
            hashed with scrypt; sessions use httpOnly cookies. Put this app behind HTTPS before
            exposing it publicly.
          </p>
        </div>
      </main>
    </div>
  );
}
