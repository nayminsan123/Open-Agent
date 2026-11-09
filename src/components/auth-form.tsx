"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";
import { AlertIcon, EyeIcon, EyeOffIcon, ShieldIcon, SparkIcon } from "./icons";

export function AuthForm({
  hasUsers,
  allowSignup,
}: {
  hasUsers: boolean;
  allowSignup: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">(hasUsers ? "login" : "register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registering = mode === "register";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(registering ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "Something went wrong. Please try again.");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.07] bg-[#0a0d0c] p-10 lg:flex">
        <div className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative flex items-center gap-2.5">
          <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-[#04120c] shadow-[0_0_18px_-4px] shadow-emerald-500/60">
            <SparkIcon className="size-4.5" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight text-zinc-100">OpenAgent</p>
            <p className="font-mono text-[10px] text-zinc-500">AI workspace · self-hosted</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50">
            Your private AI workspace.
          </h1>
          <p className="mt-3 text-[13px] leading-6 text-zinc-500">
            Bring any OpenAI-compatible provider — OpenAI, Ollama, LM Studio, OpenRouter — and give
            your team one place to chat.
          </p>
          <ul className="mt-8 space-y-4">
            {[
              ["Any provider", "Base URL + API key, stored server-side."],
              ["Per-user history", "Conversations saved in your own SQLite database."],
              ["Model switching", "Pick a model per chat, set defaults per user."],
              ["Admin controls", "Invite users, reset passwords, toggle sign-ups."],
            ].map(([title, description]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10">
                  <span className="size-1.5 rounded-full bg-emerald-400" />
                </span>
                <span>
                  <span className="block text-[12px] font-medium text-zinc-200">{title}</span>
                  <span className="block text-[11px] leading-relaxed text-zinc-600">
                    {description}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative font-mono text-[10px] text-zinc-700">
          data stays on your server · sqlite · no telemetry
        </p>
      </div>

      <div className="relative flex items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 text-[#04120c]">
              <SparkIcon className="size-4.5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-zinc-100">OpenAgent</p>
              <p className="font-mono text-[10px] text-zinc-500">AI workspace</p>
            </div>
          </div>

          <div className="mb-6">
            <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-emerald-400/80 uppercase">
              <ShieldIcon className="size-3" />
              {registering ? (hasUsers ? "Create account" : "First-run setup") : "Sign in"}
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-100">
              {registering
                ? hasUsers
                  ? "Create your account"
                  : "Create the admin account"
                : "Welcome back"}
            </h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-zinc-500">
              {registering
                ? hasUsers
                  ? "Sign-ups are enabled on this instance."
                  : "This is the first account on this instance and will be granted admin access."
                : "Sign in to continue to your conversations."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3.5">
            {registering && (
              <div className="space-y-1.5">
                <label htmlFor="name" className="text-[11px] font-medium text-zinc-400">
                  Name
                </label>
                <input
                  id="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12.5px] text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-[11px] font-medium text-zinc-400">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[12.5px] text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-[11px] font-medium text-zinc-400">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={registering ? "At least 8 characters" : "••••••••"}
                  autoComplete={registering ? "new-password" : "current-password"}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 pr-10 text-[12.5px] text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-400/30 focus:ring-2 focus:ring-emerald-400/10 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-zinc-500 transition hover:bg-white/5 hover:text-zinc-300"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOffIcon className="size-3.5" /> : <EyeIcon className="size-3.5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.07] px-3 py-2 text-[11px] leading-relaxed text-rose-200">
                <AlertIcon className="mt-0.5 size-3.5 shrink-0" />
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-emerald-400 px-3 py-2.5 text-[12.5px] font-semibold text-[#04120c] transition hover:bg-emerald-300 disabled:opacity-60"
            >
              {loading
                ? registering
                  ? "Creating account…"
                  : "Signing in…"
                : registering
                  ? "Create account"
                  : "Sign in"}
            </button>
          </form>

          {hasUsers && allowSignup && (
            <p className="mt-5 text-center text-[11px] text-zinc-600">
              {registering ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                onClick={() => {
                  setMode(registering ? "login" : "register");
                  setError(null);
                }}
                className="font-medium text-emerald-300 transition hover:text-emerald-200"
              >
                {registering ? "Sign in" : "Create one"}
              </button>
            </p>
          )}

          {!hasUsers && (
            <p className="mt-5 text-center font-mono text-[10px] text-zinc-600">
              register first, then configure your provider in Admin.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
