const BACKEND_ORIGIN = "https://harvey-english-career.sshidecap-portable.chatgpt.site";

function apiOrigin() {
  if (typeof window === "undefined") return BACKEND_ORIGIN;
  if (window.location.hostname === "terminal.local" || window.location.hostname.endsWith("chatgpt.site")) return window.location.origin;
  return BACKEND_ORIGIN;
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${apiOrigin()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) {
    const error = new Error(payload.error ?? `API error ${response.status}`) as Error & { status?: number; payload?: T };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export type AuthResult = {
  token: string;
  expiresAt: string;
  user: { username: string };
};

export type DataResult<T> = {
  data: T;
  version: number;
  updatedAt: string | null;
};

export type GitHubSettingsResult = {
  configured: boolean;
  settings: null | {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    last_backup_at: string | null;
    last_backup_error: string | null;
  };
};

export const syncApi = {
  status: () => apiRequest<{ setupRequired: boolean }>("/api/auth/status"),
  register: (username: string, password: string, setupCode: string) => apiRequest<AuthResult>("/api/auth/register", { method: "POST", body: JSON.stringify({ username, password, setupCode }) }),
  login: (username: string, password: string) => apiRequest<AuthResult>("/api/auth/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  me: (token: string) => apiRequest<{ user: { id: string; username: string } }>("/api/auth/me", {}, token),
  logout: (token: string) => apiRequest<{ ok: true }>("/api/auth/logout", { method: "POST" }, token),
  getData: <T>(token: string) => apiRequest<DataResult<T>>("/api/data", {}, token),
  putData: <T>(token: string, data: T, baseVersion: number) => apiRequest<DataResult<T>>("/api/data", { method: "PUT", body: JSON.stringify({ data, baseVersion }) }, token),
  getGitHubSettings: (token: string) => apiRequest<GitHubSettingsResult>("/api/github/config", {}, token),
  saveGitHubSettings: (token: string, settings: { owner: string; repo: string; branch: string; path: string; token?: string }) => apiRequest<{ ok: true }>("/api/github/config", { method: "PUT", body: JSON.stringify(settings) }, token),
  backupNow: (token: string) => apiRequest<{ ok: true }>("/api/github/sync", { method: "POST" }, token),
};
