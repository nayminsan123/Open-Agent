import { cookies } from "next/headers";
import {
  checkRegisterThrottle,
  clientIp,
  cookieOptions,
  hashPassword,
  issueSession,
  recordRegisterAttempt,
  SESSION_COOKIE,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { countUsers, createUser, findUserByEmail, getProviderSettings, mapUser } from "@/lib/db";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!checkRegisterThrottle(ip)) {
    return Response.json(
      { error: "Too many sign-up attempts. Try again later." },
      { status: 429 },
    );
  }
  recordRegisterAttempt(ip);

  let body: { email?: unknown; name?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password : "";

  const firstUser = countUsers() === 0;
  if (!firstUser && !getProviderSettings().allowSignup) {
    return Response.json(
      { error: "Sign-ups are disabled. Ask an administrator to create an account." },
      { status: 403 },
    );
  }

  if (!validateEmail(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    return Response.json({ error: passwordError }, { status: 400 });
  }
  if (findUserByEmail(email)) {
    return Response.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const user = createUser({
    email,
    name: name || email.split("@")[0],
    passwordHash: hashPassword(password),
    role: firstUser ? "admin" : "user",
  });

  const { token, maxAge } = issueSession(user.id);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, cookieOptions(maxAge));

  return Response.json({ user: mapUser(user) }, { status: 201 });
}
