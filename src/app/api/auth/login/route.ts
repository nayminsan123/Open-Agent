import { cookies } from "next/headers";
import {
  clearLoginAttempts,
  clientIp,
  checkLoginThrottle,
  cookieOptions,
  issueSession,
  recordFailedLogin,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { findUserByEmail, mapUser } from "@/lib/db";

export async function POST(request: Request) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const ip = clientIp(request);
  if (!checkLoginThrottle(ip, email)) {
    return Response.json(
      { error: "Too many failed attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const row = findUserByEmail(email);
  if (!row || !verifyPassword(password, row.password_hash)) {
    recordFailedLogin(ip, email);
    return Response.json({ error: "Invalid email or password." }, { status: 401 });
  }

  clearLoginAttempts(ip, email);
  const { token, maxAge } = issueSession(row.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(maxAge));

  return Response.json({ user: mapUser(row) });
}
