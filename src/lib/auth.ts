import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  createDbSession,
  deleteDbSession,
  findSessionUser,
  findUserById,
  mapUser,
  purgeExpiredSessions,
  type DbUser,
} from "./db";
import type { PublicUser } from "./types";

export const SESSION_COOKIE = "agent_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, "hex");
    const candidate = scryptSync(password, salt, 64);
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function issueSession(userId: string): { token: string; maxAge: number } {
  const token = randomBytes(32).toString("base64url");
  purgeExpiredSessions();
  createDbSession(userId, sha256(token), Date.now() + SESSION_TTL_MS);
  return { token, maxAge: Math.floor(SESSION_TTL_MS / 1000) };
}

export function revokeSession(token: string) {
  deleteDbSession(sha256(token));
}

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return findSessionUser(sha256(token));
}

export function currentUserOrNull(user: DbUser | undefined): PublicUser | null {
  return user ? mapUser(user) : null;
}

export function getUserById(id: string): PublicUser | null {
  return currentUserOrNull(findUserById(id));
}

export function validatePassword(password: string): string | null {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters.";
  }
  if (password.length > 200) return "Password is too long.";
  return null;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/*
 * In-memory throttles. Failed logins are counted per email (the real brute-force
 * target) and, with a higher ceiling, per IP. Header-derived IPs are spoofable, so
 * the email bucket is what actually protects an account; the IP bucket only limits
 * broad spraying from one address.
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_EMAIL_LIMIT = 10;
const LOGIN_IP_LIMIT = 50;

const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const REGISTER_IP_LIMIT = 5;

function isAllowed(key: string, limit: number): boolean {
  const entry = attempts.get(key);
  if (!entry) return true;
  if (entry.resetAt <= Date.now()) {
    attempts.delete(key);
    return true;
  }
  return entry.count < limit;
}

function bump(key: string, windowMs: number) {
  if (attempts.size > 5_000) {
    const now = Date.now();
    for (const [existing, entry] of attempts) {
      if (entry.resetAt <= now) attempts.delete(existing);
    }
  }
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    attempts.set(key, { count: 1, resetAt: Date.now() + windowMs });
  } else {
    entry.count += 1;
  }
}

function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function checkLoginThrottle(ip: string, email: string): boolean {
  return (
    isAllowed(`login-ip:${ip}`, LOGIN_IP_LIMIT) &&
    isAllowed(`login-email:${emailKey(email)}`, LOGIN_EMAIL_LIMIT)
  );
}

export function recordFailedLogin(ip: string, email: string) {
  bump(`login-ip:${ip}`, LOGIN_WINDOW_MS);
  bump(`login-email:${emailKey(email)}`, LOGIN_WINDOW_MS);
}

export function clearLoginAttempts(_ip: string, email: string) {
  attempts.delete(`login-email:${emailKey(email)}`);
}

export function checkRegisterThrottle(ip: string): boolean {
  return isAllowed(`register-ip:${ip}`, REGISTER_IP_LIMIT);
}

export function recordRegisterAttempt(ip: string) {
  bump(`register-ip:${ip}`, REGISTER_WINDOW_MS);
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}
