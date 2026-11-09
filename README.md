# OpenAgent

A self-hosted, multi-user AI chat workspace in the spirit of Open WebUI. Point it at any
**OpenAI-compatible** provider (OpenAI, Ollama, LM Studio, OpenRouter, Groq, vLLM…) and give
your team one place to chat, with per-user history stored in SQLite on your own server.

- **Multi-user auth** — email + password, scrypt hashing, httpOnly session cookies.
- **Roles** — the first account is the admin; admins configure the provider and manage users.
- **Per-user history** — conversations and messages live in `data/agent.db` (SQLite, WAL).
- **Streaming chat** — server-side proxy, token-by-token streaming, markdown + code blocks.
- **Model switching** — model list is pulled from the provider; pick per chat or set defaults.
- **Keys stay server-side** — the provider API key never reaches the browser.

## Requirements

- Node.js **24+** (uses the built-in `node:sqlite` module)
- npm

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000 — the first visit shows a **first-run setup** form. The account you
create there becomes the administrator.

Production:

```bash
npm run build
npm start
```

## First steps

1. Register the first account — it is automatically granted `admin`.
2. Open **Admin console** (sidebar footer → Admin console).
3. Set the provider:
   - **Base URL** — e.g. `https://api.openai.com/v1`, `http://localhost:11434/v1` (Ollama),
     `http://localhost:1234/v1` (LM Studio), `https://openrouter.ai/api/v1`
   - **API key** — required for hosted providers, optional for local ones
   - **Fallback model** — used when nothing else is selected
   - **Open sign-ups** — off by default; leave it off and create accounts in the admin panel
4. Press **Test connection** to verify, then **Save settings**.
5. Back in the chat, pick a model in the header and start a conversation.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `AGENT_DATA_DIR` | `<project>/data` | Directory holding `agent.db`. Point it at a volume when self-hosting. |
| `PORT` | `3000` | Port used by `npm start`. |

Provider settings (base URL, API key, fallback model, sign-up toggle) and user preferences are
stored in the database, not in env files. To reset everything, stop the server and delete
`data/agent.db*`.

## How it works

```
Browser ──fetch──> /api/chat (server) ──fetch──> {baseUrl}/chat/completions
                        │                              (stream: true)
                        ├── saves user message
                        ├── parses upstream SSE
                        └── re-emits NDJSON events ──> Browser renders tokens live
```

`POST /api/chat` parses the upstream SSE stream and re-emits newline-delimited JSON
(`ChatStreamEvent` in `src/lib/types.ts`):

| Event | Payload |
| --- | --- |
| `conversation` | the created/loaded conversation (so a new chat appears in the sidebar) |
| `delta` | `{ text }` — the next token chunk |
| `done` | the saved assistant message (id + timestamp) |
| `error` | a human-readable message |

The assistant reply is persisted before `done` is sent; aborting the request stops the
upstream call and keeps whatever text already arrived.

### Auth model

- Passwords: scrypt with a per-user random salt (`salt:hash`).
- Sessions: 32-byte random token in an httpOnly, sameSite=lax cookie; only its SHA-256 hash is
  stored in `sessions`, with a 30-day TTL and expiry purge on login.
- Login throttle: 10 failed attempts per email and 50 per IP per 10 minutes, plus 5 sign-up
  attempts per IP per hour (in-memory; the email bucket is the effective brute-force guard).
- Resetting a password revokes every session that user holds (an admin changing their own
  password is re-issued a fresh session).
- `secure` cookies are enabled automatically in production, so run behind HTTPS.

### Database

`src/lib/db.ts` owns the schema and all queries: `users`, `sessions`, `conversations`,
`messages`, `settings`. The connection is a module-level singleton (`DatabaseSync`), WAL mode,
foreign keys on, cascade deletes so removing a user removes their conversations.

## API

| Route | Method | Notes |
| --- | --- | --- |
| `/api/auth/register` | POST | First user becomes admin; later users need sign-ups enabled |
| `/api/auth/login` | POST | Sets the session cookie |
| `/api/auth/logout` | POST | Revokes the session |
| `/api/me` | GET/PATCH | Current user + preferences (default model, system prompt, temperature) |
| `/api/models` | GET | `?refresh=1` bypasses the 60s cache |
| `/api/conversations` | GET/POST | List / create |
| `/api/conversations/[id]` | GET/PATCH/DELETE | Detail with messages, rename/model/system prompt, delete |
| `/api/chat` | POST | NDJSON stream (see above) |
| `/api/admin/settings` | GET/PUT | Provider config + sign-up toggle (admin only) |
| `/api/admin/users` | GET/POST | List / create users (admin only) |
| `/api/admin/users/[id]` | PATCH/DELETE | Role, password reset, delete (admin only) |

## Structure

```
src/
  app/
    api/
      admin/settings/route.ts       # provider config
      admin/users/route.ts          # user list + create
      admin/users/[id]/route.ts     # role / password / delete
      auth/{login,register,logout}/route.ts
      chat/route.ts                 # streaming proxy + persistence
      conversations/route.ts        # list + create
      conversations/[id]/route.ts   # detail, patch, delete
      me/route.ts                   # session user + preferences
      models/route.ts               # provider model list
    login/page.tsx                  # sign in / first-run setup
    admin/page.tsx                  # admin console
    page.tsx                        # chat workspace
    layout.tsx, globals.css
  components/
    chat-app.tsx                    # chat state, streaming client, sidebar wiring
    sidebar.tsx                     # conversation groups, search, user footer
    chat-message.tsx, markdown.tsx  # message rendering, markdown + code blocks
    composer.tsx, model-picker.tsx  # input box, model dropdown
    settings-dialog.tsx             # per-user defaults
    admin-dashboard.tsx             # provider + user management
    auth-form.tsx                   # login / register
    icons.tsx
  lib/
    db.ts    # schema + queries (node:sqlite)
    auth.ts  # scrypt, sessions, cookies, throttle
    llm.ts   # provider config, model discovery cache
    types.ts, utils.ts
data/
  agent.db  # created on first run (gitignored)
```

## Notes

- Sign-ups are disabled by default after the first account; create users from the admin panel.
- Removing a user cascades to their conversations and sessions.
- The app has no telemetry and makes no outbound requests other than to your provider.
- `GET /api/models` caches per base URL + key for 60 seconds, and caches failures for 15 seconds
  so an unreachable provider cannot slow every request.
- The model list is fetched in the browser after the page renders, so a slow or hanging provider
  never blocks the workspace from loading.
- Responses carry `Content-Security-Policy` (`frame-ancestors 'none'`), `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy` and `Permissions-Policy`; `X-Powered-By`
  is turned off.
- A system prompt stored on a conversation (via `PATCH /api/conversations/[id]`) overrides the
  user's default prompt; otherwise the current default is sent on every request.
- Long chats are trimmed to the newest 40 messages (about 48k characters) before being sent to
  the provider, so a long history cannot exceed the model's context window.
