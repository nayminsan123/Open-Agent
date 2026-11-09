import { cookies } from "next/headers";
import {
  cookieOptions,
  getCurrentUser,
  hashPassword,
  issueSession,
  SESSION_COOKIE,
  validatePassword,
} from "@/lib/auth";
import {
  adminCount,
  deleteSessionsForUser,
  deleteUser,
  findUserById,
  mapUser,
  updateUserPassword,
  updateUserRole,
} from "@/lib/db";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  if (user.role !== "admin") {
    return { error: Response.json({ error: "Admin access required." }, { status: 403 }) };
  }
  return { user };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  const target = findUserById(id);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });

  let body: { role?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.role === "admin" || body.role === "user") {
    if (id === guard.user.id && body.role !== "admin") {
      return Response.json({ error: "You cannot remove your own admin role." }, { status: 400 });
    }
    if (target.role === "admin" && body.role === "user" && adminCount() <= 1) {
      return Response.json({ error: "At least one admin account is required." }, { status: 400 });
    }
    updateUserRole(id, body.role);
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    const passwordError = validatePassword(body.password);
    if (passwordError) return Response.json({ error: passwordError }, { status: 400 });
    updateUserPassword(id, hashPassword(body.password));
    // A changed password must invalidate every session issued with the old one.
    deleteSessionsForUser(id);
    if (id === guard.user.id) {
      // Keep the administrator who changed their own password signed in.
      const { token, maxAge } = issueSession(id);
      const store = await cookies();
      store.set(SESSION_COOKIE, token, cookieOptions(maxAge));
    }
  }

  const updated = findUserById(id);
  return Response.json({ user: updated ? mapUser(updated) : null });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard.error) return guard.error;

  const { id } = await params;
  if (id === guard.user.id) {
    return Response.json({ error: "You cannot delete your own account." }, { status: 400 });
  }

  const target = findUserById(id);
  if (!target) return Response.json({ error: "User not found." }, { status: 404 });
  if (target.role === "admin" && adminCount() <= 1) {
    return Response.json({ error: "At least one admin account is required." }, { status: 400 });
  }

  deleteUser(id);
  return Response.json({ ok: true });
}
