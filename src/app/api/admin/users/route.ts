import {
  getCurrentUser,
  hashPassword,
  validateEmail,
  validatePassword,
} from "@/lib/auth";
import { createUser, findUserByEmail, listUsers, mapUser } from "@/lib/db";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role !== "admin") {
    return { error: Response.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { user };
}

export async function GET() {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;
  return Response.json({ users: listUsers() });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  let body: { email?: unknown; name?: unknown; password?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role === "admin" ? "admin" : "user";

  if (!validateEmail(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const passwordError = validatePassword(password);
  if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
  if (findUserByEmail(email)) {
    return Response.json({ error: "An account with that email already exists." }, { status: 409 });
  }

  const user = createUser({
    email,
    name: name || email.split("@")[0],
    passwordHash: hashPassword(password),
    role,
  });

  return Response.json({ user: mapUser(user) }, { status: 201 });
}
