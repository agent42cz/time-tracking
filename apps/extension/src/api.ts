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

export type ThemePreference = 'light' | 'dark' | 'system';

export interface MeResponse {
  userId: string;
  email: string;
  fullName: string;
  totpEnabled: boolean;
  /** User's preferred theme — shared with the web app. */
  theme?: ThemePreference;
  memberships: Membership[];
  wsUrl: string | null;
  /** When true, stopping a timer that overlaps offers rearrangement. */
  autoStackOverlaps?: boolean;
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
  note: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string | null;
  projectName: string | null;
  startedAt: string;
  endedAt: string | null;
  tags: TagDto[];
}

export interface OverlapInfo {
  entryId: string;
  startedAt: string;
  endedAt: string;
}

export type AutoStackDirection = 'forward' | 'backward' | 'manual';

export interface WireRange {
  startedAt: string;
  endedAt: string;
}

export interface WireShift {
  entryId: string;
  before: WireRange;
  after: WireRange;
}

export interface WirePlan {
  direction: AutoStackDirection;
  shifts: WireShift[];
  candidateAfter: WireRange;
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
const POPUP_CACHE_KEY = 'tt:popup-cache';
const POPUP_CACHE_VERSION = 1;
export const DEFAULT_API_BASE: string =
  import.meta.env.VITE_DEFAULT_API_BASE?.trim() || 'http://localhost:3000';

export interface PopupSnapshot {
  me: MeResponse;
  timer: TimerResponse;
  catalog: CatalogResponse;
}

interface PopupCacheEnvelope extends PopupSnapshot {
  version: number;
}

export async function getPopupCache(storage: StorageAdapter): Promise<PopupSnapshot | null> {
  const raw = await storage.get<PopupCacheEnvelope>(POPUP_CACHE_KEY);
  if (!raw || raw.version !== POPUP_CACHE_VERSION) return null;
  return { me: raw.me, timer: raw.timer, catalog: raw.catalog };
}

export async function setPopupCache(
  storage: StorageAdapter,
  snapshot: PopupSnapshot,
): Promise<void> {
  const envelope: PopupCacheEnvelope = { version: POPUP_CACHE_VERSION, ...snapshot };
  await storage.set(POPUP_CACHE_KEY, envelope);
}

export async function clearPopupCache(storage: StorageAdapter): Promise<void> {
  await storage.remove(POPUP_CACHE_KEY);
}

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

export async function updateTheme(session: ApiSession, theme: ThemePreference): Promise<void> {
  await call(
    session.apiBase,
    '/api/v1/me',
    { method: 'PATCH', body: JSON.stringify({ theme }) },
    session.token,
  );
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

export interface StopTimerResult {
  overlap: OverlapInfo | null;
}

export async function stopTimer(session: ApiSession, entryId: string): Promise<StopTimerResult> {
  const data = await call<{ ok: true; overlap: OverlapInfo | null }>(
    session.apiBase,
    `/api/v1/timer/${encodeURIComponent(entryId)}/stop`,
    { method: 'POST' },
    session.token,
  );
  return { overlap: data.overlap ?? null };
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

export interface UpdateEntryPatch {
  description?: string;
  note?: string;
  clientId?: string | null;
  projectId?: string | null;
  startedAt?: string; // ISO
  endedAt?: string | null; // ISO, or null to clear (re-open a running timer)
  tagIds?: string[];
}

export async function updateEntry(
  session: ApiSession,
  entryId: string,
  patch: UpdateEntryPatch,
): Promise<void> {
  await call(
    session.apiBase,
    `/api/v1/entries/${encodeURIComponent(entryId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) },
    session.token,
  );
}

export interface ManualEntryApiInput {
  description?: string;
  note?: string;
  clientId?: string | null;
  projectId?: string | null;
  startedAt: string; // ISO
  endedAt: string; // ISO
  tagIds?: string[];
}

export async function createManualEntry(
  session: ApiSession,
  companyId: string | null,
  input: ManualEntryApiInput,
): Promise<{ id: string }> {
  const qs = companyId ? `?company=${encodeURIComponent(companyId)}` : '';
  return call<{ id: string }>(
    session.apiBase,
    `/api/v1/entries${qs}`,
    { method: 'POST', body: JSON.stringify(input) },
    session.token,
  );
}

export async function createProject(
  session: ApiSession,
  input: { clientId: string; name: string },
): Promise<{ id: string }> {
  return call<{ id: string }>(
    session.apiBase,
    '/api/v1/projects',
    { method: 'POST', body: JSON.stringify(input) },
    session.token,
  );
}

export interface AutoStackBody {
  direction: AutoStackDirection;
  /** ISO; required when direction === 'manual'. */
  startedAt?: string;
}

export async function previewAutoStack(
  session: ApiSession,
  entryId: string,
  body: AutoStackBody,
): Promise<WirePlan> {
  const res = await call<{ ok: true; plan: WirePlan }>(
    session.apiBase,
    `/api/v1/entries/${encodeURIComponent(entryId)}/auto-stack/preview`,
    { method: 'POST', body: JSON.stringify(body) },
    session.token,
  );
  return res.plan;
}

export async function applyAutoStack(
  session: ApiSession,
  entryId: string,
  body: AutoStackBody,
): Promise<WirePlan> {
  const res = await call<{ ok: true; plan: WirePlan }>(
    session.apiBase,
    `/api/v1/entries/${encodeURIComponent(entryId)}/auto-stack`,
    { method: 'POST', body: JSON.stringify(body) },
    session.token,
  );
  return res.plan;
}

export { ApiError };
