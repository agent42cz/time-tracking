/**
 * Thin API client for the time tracker REST surface.
 * Reads the bearer token from `chrome.storage.local` and the configured
 * `apiBase` (default: `VITE_DEFAULT_API_BASE` at build time, else
 * localhost:3000 — overridable in popup settings).
 */
import type { StorageAdapter } from './storage.js';

export interface Membership {
  companyId: string;
  companyName: string;
  companySlug: string;
  role: 'admin' | 'user';
}

export interface MeResponse {
  userId: string;
  email: string;
  fullName: string;
  totpEnabled: boolean;
  memberships: Membership[];
  wsUrl: string | null;
}

export interface TagDto {
  id: string;
  name: string;
  color: string;
}

export interface ClientDto {
  id: string;
  name: string;
  projects: { id: string; name: string }[];
}

export interface CatalogResponse {
  companyId: string | null;
  clients: ClientDto[];
  tags: TagDto[];
}

export interface EntryDto {
  id: string;
  description: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  startedAt: string;
  endedAt: string | null;
  tags: TagDto[];
}

export interface TimerSummary {
  /** Total ms of completed entries whose start is within the current ISO week (Mon, Europe/Prague). */
  weekMs: number;
  /** Total ms of completed entries whose start is within the current calendar month. */
  monthMs: number;
  /** Total ms of completed entries whose start is within the previous calendar month. */
  lastMonthMs: number;
}

export interface TimerResponse {
  companyId: string | null;
  running: EntryDto[];
  /** Today's completed entries — used by the web /timer page. */
  today?: EntryDto[];
  /**
   * Completed entries from start-of-last-month through end-of-this-month
   * (extended to end-of-week when the current week spills into the next month).
   * Newest first. Optional so the popup tolerates a brief server/extension
   * version skew (e.g. extension reloaded before the web app finishes
   * redeploying).
   */
  history?: EntryDto[];
  /** Pre-computed totals shown in the popup's summary cards. */
  summary?: TimerSummary;
}

export interface ApiSession {
  token: string;
  expiresAt: string;
  apiBase: string;
}

const SESSION_KEY = 'tt:session';
const API_BASE_KEY = 'tt:api-base';
export const DEFAULT_API_BASE: string =
  import.meta.env.VITE_DEFAULT_API_BASE?.trim() || 'http://localhost:3000';

export async function getStoredSession(storage: StorageAdapter): Promise<ApiSession | null> {
  return storage.get<ApiSession>(SESSION_KEY);
}

export async function setStoredSession(
  storage: StorageAdapter,
  session: ApiSession | null,
): Promise<void> {
  if (session) await storage.set(SESSION_KEY, session);
  else await storage.remove(SESSION_KEY);
}

export async function getApiBase(storage: StorageAdapter): Promise<string> {
  return (await storage.get<string>(API_BASE_KEY)) ?? DEFAULT_API_BASE;
}

export async function setApiBase(storage: StorageAdapter, base: string): Promise<void> {
  await storage.set(API_BASE_KEY, base);
}

class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`${status} ${code}`);
  }
}

async function call<T>(
  base: string,
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    let code = 'http_error';
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) code = body.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

export interface LoginInput {
  apiBase: string;
  email: string;
  password: string;
  totpCode?: string;
}

export async function login(input: LoginInput): Promise<ApiSession> {
  const data = await call<{ token: string; expiresAt: string; userId: string }>(
    input.apiBase,
    '/api/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        totpCode: input.totpCode,
      }),
    },
    null,
  );
  return { token: data.token, expiresAt: data.expiresAt, apiBase: input.apiBase };
}

export async function logout(session: ApiSession): Promise<void> {
  try {
    await call(session.apiBase, '/api/v1/auth/logout', { method: 'POST' }, session.token);
  } catch {
    /* swallow — local logout still happens */
  }
}

export async function me(session: ApiSession): Promise<MeResponse> {
  return call<MeResponse>(session.apiBase, '/api/v1/me', { method: 'GET' }, session.token);
}

export async function getTimer(session: ApiSession, companyId?: string): Promise<TimerResponse> {
  const qs = companyId ? `?company=${encodeURIComponent(companyId)}` : '';
  return call<TimerResponse>(
    session.apiBase,
    `/api/v1/timer${qs}`,
    { method: 'GET' },
    session.token,
  );
}

export async function getCatalog(
  session: ApiSession,
  companyId?: string,
): Promise<CatalogResponse> {
  const qs = companyId ? `?company=${encodeURIComponent(companyId)}` : '';
  return call<CatalogResponse>(
    session.apiBase,
    `/api/v1/catalog${qs}`,
    { method: 'GET' },
    session.token,
  );
}

export interface StartTimerInput {
  description?: string;
  clientId?: string | null;
  projectId?: string | null;
  tagIds?: string[];
}

export async function startTimer(
  session: ApiSession,
  companyId: string | null,
  input: StartTimerInput,
): Promise<{ id: string }> {
  const qs = companyId ? `?company=${encodeURIComponent(companyId)}` : '';
  return call<{ id: string }>(
    session.apiBase,
    `/api/v1/timer${qs}`,
    { method: 'POST', body: JSON.stringify(input) },
    session.token,
  );
}

export async function stopTimer(session: ApiSession, entryId: string): Promise<void> {
  await call(
    session.apiBase,
    `/api/v1/timer/${encodeURIComponent(entryId)}/stop`,
    { method: 'POST' },
    session.token,
  );
}

export async function deleteEntry(session: ApiSession, entryId: string): Promise<void> {
  await call(
    session.apiBase,
    `/api/v1/entries/${encodeURIComponent(entryId)}`,
    { method: 'DELETE' },
    session.token,
  );
}

export async function playAgain(session: ApiSession, entryId: string): Promise<{ id: string }> {
  return call<{ id: string }>(
    session.apiBase,
    `/api/v1/entries/${encodeURIComponent(entryId)}/play-again`,
    { method: 'POST' },
    session.token,
  );
}

export { ApiError };
