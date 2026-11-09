import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT, DEFAULT_TEMPERATURE } from "./defaults";
import type { ChatMessage, Conversation, PublicUser, UserPreferences } from "./types";

export interface DbUser {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  role: "admin" | "user";
  preferences: string;
  created_at: number;
}

interface DbConversation {
  id: string;
  user_id: string;
  title: string;
  model: string | null;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
}

interface DbMessage {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: number;
  seq: number;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultModel: DEFAULT_MODEL,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: DEFAULT_TEMPERATURE,
};

const SETTINGS_DEFAULTS: Record<string, string> = {
  provider_base_url: "https://api.openai.com/v1",
  provider_api_key: "",
  allow_signup: "false",
  default_model: DEFAULT_MODEL,
};

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    preferences TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New chat',
    model TEXT,
    system_prompt TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    seq INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, seq);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

const globalForDb = globalThis as unknown as { __agentDb?: DatabaseSync };

function initDb(): DatabaseSync {
  const dataDir = process.env.AGENT_DATA_DIR ?? path.join(process.cwd(), "data");
  fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(path.join(dataDir, "agent.db"));
  db.exec(SCHEMA);

  const insertSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    insertSetting.run(key, value);
  }

  return db;
}

export function getDb(): DatabaseSync {
  if (!globalForDb.__agentDb) {
    globalForDb.__agentDb = initDb();
  }
  return globalForDb.__agentDb;
}

/* ---------------------------------------------------------------- settings */

export function getSetting(key: string, fallback = ""): string {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

export function getProviderSettings() {
  return {
    baseUrl: getSetting("provider_base_url", SETTINGS_DEFAULTS.provider_base_url),
    apiKey: getSetting("provider_api_key", ""),
    defaultModel: getSetting("default_model", SETTINGS_DEFAULTS.default_model),
    allowSignup: getSetting("allow_signup", "false") === "true",
  };
}

/* ------------------------------------------------------------------- users */

export function mapUser(row: DbUser): PublicUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
  };
}

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  return row.count;
}

export function findUserByEmail(email: string): DbUser | undefined {
  return getDb()
    .prepare("SELECT * FROM users WHERE lower(email) = lower(?)")
    .get(email.trim()) as DbUser | undefined;
}

export function findUserById(id: string): DbUser | undefined {
  return getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as DbUser | undefined;
}

export function createUser(input: {
  email: string;
  name: string;
  passwordHash: string;
  role?: "admin" | "user";
}): DbUser {
  const user: DbUser = {
    id: randomUUID(),
    email: input.email.trim().toLowerCase(),
    name: input.name.trim(),
    password_hash: input.passwordHash,
    role: input.role ?? "user",
    preferences: JSON.stringify({
      ...DEFAULT_PREFERENCES,
      defaultModel:
        getSetting("default_model", DEFAULT_PREFERENCES.defaultModel) ||
        DEFAULT_PREFERENCES.defaultModel,
    }),
    created_at: Date.now(),
  };

  getDb()
    .prepare(
      "INSERT INTO users (id, email, name, password_hash, role, preferences, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      user.id,
      user.email,
      user.name,
      user.password_hash,
      user.role,
      user.preferences,
      user.created_at,
    );

  return user;
}

export function listUsers(): Array<PublicUser & { conversationCount: number }> {
  const rows = getDb()
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM conversations c WHERE c.user_id = u.id) AS conversation_count
       FROM users u ORDER BY u.created_at ASC`,
    )
    .all() as unknown as Array<DbUser & { conversation_count: number }>;

  return rows.map((row) => ({
    ...mapUser(row),
    conversationCount: row.conversation_count,
  }));
}

export function updateUserRole(id: string, role: "admin" | "user") {
  getDb().prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

export function adminCount(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get() as {
    count: number;
  };
  return row.count;
}

export function updateUserPassword(id: string, passwordHash: string) {
  getDb().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}

export function deleteUser(id: string) {
  getDb().prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function getUserPreferences(user: DbUser): UserPreferences {
  try {
    const parsed = JSON.parse(user.preferences) as Partial<UserPreferences>;
    return {
      defaultModel: parsed.defaultModel?.trim() || DEFAULT_PREFERENCES.defaultModel,
      systemPrompt:
        typeof parsed.systemPrompt === "string" ? parsed.systemPrompt : DEFAULT_PREFERENCES.systemPrompt,
      temperature:
        typeof parsed.temperature === "number" && parsed.temperature >= 0 && parsed.temperature <= 2
          ? parsed.temperature
          : DEFAULT_PREFERENCES.temperature,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveUserPreferences(id: string, preferences: UserPreferences) {
  getDb()
    .prepare("UPDATE users SET preferences = ? WHERE id = ?")
    .run(JSON.stringify(preferences), id);
}

/* ---------------------------------------------------------------- sessions */

export function createDbSession(userId: string, tokenHash: string, expiresAt: number) {
  getDb()
    .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash, userId, Date.now(), expiresAt);
}

export function findSessionUser(tokenHash: string): PublicUser | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, Date.now()) as DbUser | undefined;
  if (!row) return null;
  return mapUser(row);
}

export function deleteDbSession(tokenHash: string) {
  getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

/** Revoke every session of a user, e.g. after an administrator resets a password. */
export function deleteSessionsForUser(userId: string) {
  getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function purgeExpiredSessions() {
  getDb().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
}

/* ----------------------------------------------------------- conversations */

function mapConversation(row: DbConversation): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    systemPrompt: row.system_prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createConversation(input: {
  userId: string;
  title: string;
  model: string | null;
  systemPrompt?: string | null;
}): Conversation {
  const row: DbConversation = {
    id: randomUUID(),
    user_id: input.userId,
    title: input.title || "New chat",
    model: input.model,
    system_prompt: input.systemPrompt ?? null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  getDb()
    .prepare(
      "INSERT INTO conversations (id, user_id, title, model, system_prompt, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(
      row.id,
      row.user_id,
      row.title,
      row.model,
      row.system_prompt,
      row.created_at,
      row.updated_at,
    );

  return mapConversation(row);
}

export function listConversations(userId: string): Conversation[] {
  const rows = getDb()
    .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC")
    .all(userId) as unknown as DbConversation[];
  return rows.map(mapConversation);
}

export function getConversation(id: string, userId: string): Conversation | null {
  const row = getDb()
    .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
    .get(id, userId) as DbConversation | undefined;
  return row ? mapConversation(row) : null;
}

export function updateConversation(
  id: string,
  userId: string,
  patch: { title?: string; model?: string | null; systemPrompt?: string | null; touch?: boolean },
): Conversation | null {
  const conversation = getConversation(id, userId);
  if (!conversation) return null;

  const title = patch.title?.trim().slice(0, 200) || conversation.title;
  const model = patch.model !== undefined ? patch.model : conversation.model;
  const systemPrompt =
    patch.systemPrompt !== undefined ? patch.systemPrompt : conversation.systemPrompt;
  const updatedAt = patch.touch === false ? conversation.updatedAt : Date.now();

  getDb()
    .prepare(
      "UPDATE conversations SET title = ?, model = ?, system_prompt = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
    .run(title, model, systemPrompt, updatedAt, id, userId);

  return { ...conversation, title, model, systemPrompt, updatedAt };
}

export function deleteConversation(id: string, userId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?")
    .run(id, userId);
  return result.changes > 0;
}

/* ------------------------------------------------------------------ messages */

function mapMessage(row: DbMessage) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

export type StoredMessage = ReturnType<typeof mapMessage>;

export function listMessages(conversationId: string) {
  const rows = getDb()
    .prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY seq ASC")
    .all(conversationId) as unknown as DbMessage[];
  return rows.map(mapMessage);
}

/** Messages shaped for the chat UI (system prompts are never rendered). */
export function listChatMessages(conversationId: string): ChatMessage[] {
  return listMessages(conversationId)
    .filter((message) => message.role !== "system")
    .map((message) => ({
      id: message.id,
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
      createdAt: message.createdAt,
    }));
}

export function addMessage(conversationId: string, role: DbMessage["role"], content: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM messages WHERE conversation_id = ?")
    .get(conversationId) as { next: number };

  const message: DbMessage = {
    id: randomUUID(),
    conversation_id: conversationId,
    role,
    content,
    created_at: Date.now(),
    seq: row.next,
  };

  db.prepare(
    "INSERT INTO messages (id, conversation_id, role, content, created_at, seq) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    message.id,
    message.conversation_id,
    message.role,
    message.content,
    message.created_at,
    message.seq,
  );

  return mapMessage(message);
}

/* ------------------------------------------------------------------- misc */

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
