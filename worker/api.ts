interface ApiEnv {
  DB: D1Database;
  APP_ORIGIN?: string;
  BOOTSTRAP_TOKEN: string;
  TOKEN_ENCRYPTION_KEY: string;
}

interface ApiContext {
  waitUntil(promise: Promise<unknown>): void;
}

type UserRow = { id: string; username: string };
type GitHubRow = {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token_ciphertext: string;
  token_iv: string;
  last_backup_at: string | null;
  last_backup_error: string | null;
};

// 0 identifies the server-peppered HMAC-SHA256 verifier. The pepper never
// leaves the Worker environment, so a database copy alone cannot test guesses.
const PASSWORD_ITERATIONS = 0;
const SESSION_DAYS = 30;
const API_VERSION = "2026-03-10";

function allowedOrigin(request: Request, env: ApiEnv) {
  const origin = request.headers.get("Origin");
  if (!origin) return "*";
  const sameOrigin = new URL(request.url).origin;
  const configured = env.APP_ORIGIN ?? "https://harvey-shimizu.github.io";
  if (origin === sameOrigin || origin === configured || origin === "http://terminal.local:4173") return origin;
  return null;
}

function corsHeaders(request: Request, env: ApiEnv) {
  const origin = allowedOrigin(request, env);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(request: Request, env: ApiEnv, value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(request, env),
    },
  });
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(bytes = 32) {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

async function passwordHash(env: ApiEnv, password: string, salt: Uint8Array, iterations = PASSWORD_ITERATIONS) {
  if (iterations > 0) {
    const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, material, 256);
    return base64Url(new Uint8Array(bits));
  }
  const pepper = fromBase64(env.TOKEN_ENCRYPTION_KEY);
  const key = await crypto.subtle.importKey("raw", pepper, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const passwordBytes = new TextEncoder().encode(password);
  const message = new Uint8Array(salt.length + 1 + passwordBytes.length);
  message.set(salt, 0);
  message[salt.length] = 0;
  message.set(passwordBytes, salt.length + 1);
  const signature = await crypto.subtle.sign("HMAC", key, message);
  return base64Url(new Uint8Array(signature));
}

function safeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

function validPassword(password: string) {
  return password.length >= 12 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password);
}

async function createSession(env: ApiEnv, userId: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at) VALUES (?, ?, ?, ?, ?)")
    .bind(tokenHash, userId, now.toISOString(), expires.toISOString(), now.toISOString()).run();
  return { token, expiresAt: expires.toISOString() };
}

async function authenticatedUser(request: Request, env: ApiEnv): Promise<UserRow | null> {
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const tokenHash = await sha256(authorization.slice(7));
  const row = await env.DB.prepare(`
    SELECT users.id, users.username, sessions.expires_at
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `).bind(tokenHash).first<UserRow & { expires_at: string }>();
  if (!row) return null;
  if (row.expires_at <= new Date().toISOString()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  await env.DB.prepare("UPDATE sessions SET last_used_at = ? WHERE token_hash = ?").bind(new Date().toISOString(), tokenHash).run();
  return { id: row.id, username: row.username };
}

async function requestBody(request: Request) {
  const length = Number(request.headers.get("Content-Length") ?? 0);
  if (length > 1_000_000) throw new Error("PAYLOAD_TOO_LARGE");
  return request.json() as Promise<Record<string, unknown>>;
}

async function encryptionKey(env: ApiEnv) {
  const raw = fromBase64(env.TOKEN_ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptToken(env: ApiEnv, token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), new TextEncoder().encode(token));
  return { ciphertext: base64Url(new Uint8Array(ciphertext)), iv: base64Url(iv) };
}

async function decryptToken(env: ApiEnv, ciphertext: string, iv: string) {
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, await encryptionKey(env), fromBase64(ciphertext));
  return new TextDecoder().decode(plaintext);
}

function githubEndpoint(settings: Pick<GitHubRow, "owner" | "repo" | "path">) {
  const path = settings.path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(settings.owner)}/${encodeURIComponent(settings.repo)}/contents/${path}`;
}

function encodeContent(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

async function backupToGitHub(env: ApiEnv, userId: string) {
  const settings = await env.DB.prepare("SELECT * FROM github_settings WHERE user_id = ?").bind(userId).first<GitHubRow>();
  if (!settings) return;
  const state = await env.DB.prepare("SELECT data_json, version, updated_at FROM tracker_state WHERE user_id = ?").bind(userId).first<{ data_json: string; version: number; updated_at: string }>();
  if (!state) return;
  try {
    const token = await decryptToken(env, settings.token_ciphertext, settings.token_iv);
    const headers = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": API_VERSION };
    const getResponse = await fetch(`${githubEndpoint(settings)}?ref=${encodeURIComponent(settings.branch)}`, { headers });
    let sha: string | undefined;
    if (getResponse.ok) sha = ((await getResponse.json()) as { sha: string }).sha;
    else if (getResponse.status !== 404) throw new Error(`GitHub GET ${getResponse.status}`);
    const backup = { schemaVersion: 1, updatedAt: state.updated_at, version: state.version, data: JSON.parse(state.data_json) };
    const putResponse = await fetch(githubEndpoint(settings), {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `Backup Harvey Tracker ${state.updated_at}`,
        content: encodeContent(JSON.stringify(backup, null, 2)),
        branch: settings.branch,
        ...(sha ? { sha } : {}),
      }),
    });
    if (!putResponse.ok) throw new Error(`GitHub PUT ${putResponse.status}`);
    await env.DB.prepare("UPDATE github_settings SET last_backup_at = ?, last_backup_error = NULL WHERE user_id = ?").bind(new Date().toISOString(), userId).run();
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 240) : "Unknown GitHub backup error";
    await env.DB.prepare("UPDATE github_settings SET last_backup_error = ? WHERE user_id = ?").bind(message, userId).run();
    throw error;
  }
}

async function authRoutes(request: Request, env: ApiEnv, pathname: string) {
  if (pathname === "/api/auth/status" && request.method === "GET") {
    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
    return json(request, env, { setupRequired: Number(row?.count ?? 0) === 0 });
  }

  if (pathname === "/api/auth/register" && request.method === "POST") {
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
    if (Number(count?.count ?? 0) > 0) return json(request, env, { error: "初回登録は完了しています。ログインしてください。" }, 409);
    const body = await requestBody(request);
    const username = String(body.username ?? "").trim();
    const password = String(body.password ?? "");
    const setupCode = String(body.setupCode ?? "");
    if (!safeEqual(setupCode, env.BOOTSTRAP_TOKEN)) return json(request, env, { error: "初回セットアップコードが正しくありません。" }, 403);
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) return json(request, env, { error: "アカウント名は3〜32文字の英数字・._-で入力してください。" }, 400);
    if (!validPassword(password)) return json(request, env, { error: "パスワードは12文字以上で、大文字・小文字・数字を含めてください。" }, 400);
    let stage = "password";
    try {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const userId = crypto.randomUUID();
      const now = new Date().toISOString();
      const hash = await passwordHash(env, password, salt);
      stage = "database";
      await env.DB.batch([
        env.DB.prepare("INSERT INTO users (id, username, username_normalized, password_hash, password_salt, password_iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(userId, username, username.toLowerCase(), hash, base64Url(salt), PASSWORD_ITERATIONS, now),
        env.DB.prepare("INSERT INTO tracker_state (user_id, data_json, version, updated_at) VALUES (?, ?, 1, ?)").bind(userId, JSON.stringify({}), now),
      ]);
      stage = "session";
      const session = await createSession(env, userId);
      return json(request, env, { ...session, user: { username } }, 201);
    } catch (error) {
      console.error("Owner registration failed", stage, error);
      return json(request, env, { error: `初回登録に失敗しました（${stage}）。` }, 500);
    }
  }

  if (pathname === "/api/auth/login" && request.method === "POST") {
    const body = await requestBody(request);
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const row = await env.DB.prepare("SELECT * FROM users WHERE username_normalized = ?").bind(username).first<{ id: string; username: string; password_hash: string; password_salt: string; password_iterations: number }>();
    const candidate = row ? await passwordHash(env, password, fromBase64(row.password_salt), row.password_iterations) : await passwordHash(env, password, crypto.getRandomValues(new Uint8Array(16)));
    if (!row || !safeEqual(candidate, row.password_hash)) return json(request, env, { error: "アカウント名またはパスワードが正しくありません。" }, 401);
    await env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run();
    const session = await createSession(env, row.id);
    return json(request, env, { ...session, user: { username: row.username } });
  }

  if (pathname === "/api/auth/me" && request.method === "GET") {
    const user = await authenticatedUser(request, env);
    return user ? json(request, env, { user }) : json(request, env, { error: "ログインが必要です。" }, 401);
  }

  if (pathname === "/api/auth/logout" && request.method === "POST") {
    const authorization = request.headers.get("Authorization") ?? "";
    if (authorization.startsWith("Bearer ")) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(authorization.slice(7))).run();
    return json(request, env, { ok: true });
  }
  return null;
}

async function protectedRoutes(request: Request, env: ApiEnv, ctx: ApiContext, pathname: string) {
  const user = await authenticatedUser(request, env);
  if (!user) return json(request, env, { error: "セッションの有効期限が切れました。再度ログインしてください。" }, 401);

  if (pathname === "/api/data" && request.method === "GET") {
    const state = await env.DB.prepare("SELECT data_json, version, updated_at FROM tracker_state WHERE user_id = ?").bind(user.id).first<{ data_json: string; version: number; updated_at: string }>();
    return json(request, env, { data: state ? JSON.parse(state.data_json) : {}, version: state?.version ?? 0, updatedAt: state?.updated_at ?? null });
  }

  if (pathname === "/api/data" && request.method === "PUT") {
    const body = await requestBody(request);
    const data = body.data;
    const baseVersion = Number(body.baseVersion ?? 0);
    const serialized = JSON.stringify(data ?? {});
    if (serialized.length > 900_000) return json(request, env, { error: "保存データが上限を超えています。" }, 413);
    const current = await env.DB.prepare("SELECT version, data_json, updated_at FROM tracker_state WHERE user_id = ?").bind(user.id).first<{ version: number; data_json: string; updated_at: string }>();
    if (!current || current.version !== baseVersion) return json(request, env, { error: "CONFLICT", data: current ? JSON.parse(current.data_json) : {}, version: current?.version ?? 0, updatedAt: current?.updated_at ?? null }, 409);
    const nextVersion = current.version + 1;
    const now = new Date().toISOString();
    const result = await env.DB.prepare("UPDATE tracker_state SET data_json = ?, version = ?, updated_at = ? WHERE user_id = ? AND version = ?")
      .bind(serialized, nextVersion, now, user.id, current.version).run();
    if (!result.meta.changes) return json(request, env, { error: "CONFLICT" }, 409);
    ctx.waitUntil(backupToGitHub(env, user.id).catch(() => undefined));
    return json(request, env, { data, version: nextVersion, updatedAt: now });
  }

  if (pathname === "/api/github/config" && request.method === "GET") {
    const settings = await env.DB.prepare("SELECT owner, repo, branch, path, last_backup_at, last_backup_error FROM github_settings WHERE user_id = ?").bind(user.id).first<Omit<GitHubRow, "token_ciphertext" | "token_iv">>();
    return json(request, env, { configured: Boolean(settings), settings });
  }

  if (pathname === "/api/github/config" && request.method === "PUT") {
    const body = await requestBody(request);
    const owner = String(body.owner ?? "").trim();
    const repo = String(body.repo ?? "").trim();
    const branch = String(body.branch ?? "main").trim();
    const path = String(body.path ?? "data/progress.json").trim();
    const token = String(body.token ?? "").trim();
    if (!owner || !repo || !branch || !path) return json(request, env, { error: "GitHub保存先をすべて入力してください。" }, 400);
    const existing = await env.DB.prepare("SELECT token_ciphertext, token_iv FROM github_settings WHERE user_id = ?").bind(user.id).first<{ token_ciphertext: string; token_iv: string }>();
    if (!token && !existing) return json(request, env, { error: "初回設定ではGitHub保存キーが必要です。" }, 400);
    const encrypted = token ? await encryptToken(env, token) : { ciphertext: existing!.token_ciphertext, iv: existing!.token_iv };
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO github_settings (user_id, owner, repo, branch, path, token_ciphertext, token_iv, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET owner=excluded.owner, repo=excluded.repo, branch=excluded.branch, path=excluded.path,
        token_ciphertext=excluded.token_ciphertext, token_iv=excluded.token_iv, updated_at=excluded.updated_at
    `).bind(user.id, owner, repo, branch, path, encrypted.ciphertext, encrypted.iv, now).run();
    try {
      await backupToGitHub(env, user.id);
    } catch {
      return json(request, env, { error: "設定は保存しましたが、GitHubへの書込みに失敗しました。保存キーとContents権限を確認してください。" }, 502);
    }
    return json(request, env, { ok: true });
  }

  if (pathname === "/api/github/sync" && request.method === "POST") {
    try {
      await backupToGitHub(env, user.id);
      return json(request, env, { ok: true });
    } catch {
      return json(request, env, { error: "GitHubバックアップに失敗しました。設定を確認してください。" }, 502);
    }
  }
  return null;
}

export async function handleApi(request: Request, env: ApiEnv, ctx: ApiContext): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return null;
  if (!allowedOrigin(request, env)) return json(request, env, { error: "このアクセス元は許可されていません。" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request, env) });
  if (url.pathname === "/api/health") {
    await passwordHash(env, "health-check", new Uint8Array(16));
    return json(request, env, { ok: true, passwordVerifier: "ready" });
  }
  try {
    const authResponse = await authRoutes(request, env, url.pathname);
    if (authResponse) return authResponse;
    const protectedResponse = await protectedRoutes(request, env, ctx, url.pathname);
    return protectedResponse ?? json(request, env, { error: "APIが見つかりません。" }, 404);
  } catch (error) {
    if (error instanceof Error && error.message === "PAYLOAD_TOO_LARGE") return json(request, env, { error: "送信データが大きすぎます。" }, 413);
    return json(request, env, { error: "サーバー処理に失敗しました。時間を置いて再試行してください。" }, 500);
  }
}
