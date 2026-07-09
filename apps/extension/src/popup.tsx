import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  type ApiSession,
  type CatalogResponse,
  type ExtFundBar,
  type ExtFundProgress,
  type FundDisplay,
  type MeResponse,
  type StartTimerInput,
  type ThemePreference,
  type TimerResponse,
  type TimerSummary,
  DEFAULT_API_BASE,
  clearPopupCache,
  getApiBase,
  getCatalog,
  getFundDisplay,
  getFundProgress,
  getPopupCache,
  getStoredSession,
  getTimer,
  login,
  logout,
  me,
  setApiBase,
  setFundDisplay,
  setPopupCache,
  setStoredSession,
  updateTheme,
} from './api.js';
import { fmtDurationHM } from './format.js';
import { useExtensionSync } from './sync.js';
import { EntrySheet, type EntrySheetInitial } from './EntrySheet.js';
import { AutoStackSheet } from './AutoStackSheet.js';
import { NewProjectSheet } from './NewProjectSheet.js';
import { groupRecentByDay, type RecentEntryInput } from './recent.js';
import {
  applyThemeClass,
  readShowStats,
  readStoredTheme,
  resolveTheme,
  writeShowStats,
  writeStoredTheme,
} from './theme.js';
import {
  InMemoryStorageAdapter,
  createChromeStorageAdapter,
  type StorageAdapter,
} from './storage.js';

const storage: StorageAdapter =
  typeof chrome !== 'undefined' && chrome?.storage?.local
    ? createChromeStorageAdapter()
    : new InMemoryStorageAdapter();

type View = 'loading' | 'login' | 'app';

interface AppState {
  session: ApiSession;
  me: MeResponse;
  timer: TimerResponse;
  catalog: CatalogResponse;
}

export function Popup(): ReactElement {
  const [view, setView] = useState<View>('loading');
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fund, setFund] = useState<ExtFundProgress | null>(null);
  const [fundDisplay, setFundDisplayState] = useState<FundDisplay>('off');

  useEffect(() => {
    void getFundDisplay(storage).then(setFundDisplayState);
  }, []);

  const refresh = useCallback(async (session: ApiSession, companyId?: string) => {
    setRefreshing(true);
    try {
      const [user, timer, catalog, display] = await Promise.all([
        me(session),
        getTimer(session, companyId),
        getCatalog(session, companyId),
        getFundDisplay(storage),
      ]);
      setState({ session, me: user, timer, catalog });
      await setPopupCache(storage, { me: user, timer, catalog });

      const activeCompanyId = timer.companyId ?? companyId;
      const admin = user.memberships.some(
        (m) => m.companyId === activeCompanyId && m.role === 'admin',
      );
      if (admin && display !== 'off') {
        try {
          setFund(await getFundProgress(session, activeCompanyId));
        } catch {
          setFund(null);
        }
      } else {
        setFund(null);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleSetFundDisplay = useCallback(
    async (v: FundDisplay): Promise<void> => {
      setFundDisplayState(v);
      await setFundDisplay(storage, v);
      if (state) await refresh(state.session, state.timer.companyId ?? undefined);
    },
    [state, refresh],
  );

  const tryLoadFromStorage = useCallback(async (): Promise<void> => {
    const [session, cached] = await Promise.all([
      getStoredSession(storage),
      getPopupCache(storage),
    ]);
    if (!session) {
      await clearPopupCache(storage);
      setView('login');
      return;
    }
    if (cached) {
      setState({ session, ...cached });
      setView('app');
      void refresh(session).catch(async (err) => {
        if (err instanceof ApiError && err.status === 401) {
          await setStoredSession(storage, null);
          await clearPopupCache(storage);
          setState(null);
          setView('login');
        }
      });
      return;
    }
    try {
      await refresh(session);
      setView('app');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await setStoredSession(storage, null);
        await clearPopupCache(storage);
        setView('login');
      } else {
        setError('Nelze se připojit k serveru');
        setView('login');
      }
    }
  }, [refresh]);

  useEffect(() => {
    void tryLoadFromStorage();
  }, [tryLoadFromStorage]);

  // When the web-redirect bridge writes a token into chrome.storage.local
  // (or the user logs in on another popup instance), pick it up immediately.
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome?.storage?.onChanged) return;
    const listener = (
      changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
      area: string,
    ): void => {
      if (area !== 'local') return;
      if (changes['tt:session']) void tryLoadFromStorage();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [tryLoadFromStorage]);

  if (view === 'loading') return <Spinner />;

  if (view === 'login' || !state) {
    return (
      <LoginForm
        initialError={error}
        onLoggedIn={async (session) => {
          setError(null);
          await setStoredSession(storage, session);
          await refresh(session);
          setView('app');
        }}
      />
    );
  }

  return (
    <AppShell
      state={state}
      refreshing={refreshing}
      fund={fund}
      fundDisplay={fundDisplay}
      onSetFundDisplay={handleSetFundDisplay}
      onChange={() => refresh(state.session, state.timer.companyId ?? undefined)}
      onLogout={async () => {
        await logout(state.session);
        await setStoredSession(storage, null);
        await clearPopupCache(storage);
        setState(null);
        setView('login');
      }}
    />
  );
}

function Spinner(): ReactElement {
  return (
    <div className="flex h-32 w-[360px] items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
      Načítám…
    </div>
  );
}

function LoginForm({
  initialError,
  onLoggedIn,
}: {
  initialError: string | null;
  onLoggedIn: (s: ApiSession) => void | Promise<void>;
}): ReactElement {
  const [apiBase, setApiBaseLocal] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    void getApiBase(storage).then(setApiBaseLocal);
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const session = await login({
        apiBase: apiBase || DEFAULT_API_BASE,
        email,
        password,
        totpCode: totpCode.trim() || undefined,
      });
      await onLoggedIn(session);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(
          err.code === 'totp_required'
            ? 'Zadejte kód 2FA'
            : err.code === 'totp_invalid'
              ? 'Neplatný 2FA kód'
              : err.code === 'locked'
                ? 'Účet je dočasně uzamčen'
                : 'Neplatné přihlašovací údaje',
        );
      } else {
        setError('Nelze se připojit k serveru');
      }
    } finally {
      setPending(false);
    }
  }

  async function saveApiBase(): Promise<void> {
    await setApiBase(storage, apiBase);
    setShowSettings(false);
  }

  function openWebLogin(): void {
    const base = (apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
    const ch =
      typeof chrome !== 'undefined' ? (chrome as { runtime?: { id?: string } }) : undefined;
    const extId = ch?.runtime?.id;
    if (!extId) {
      setError('Rozšíření není inicializováno — restartujte prohlížeč.');
      return;
    }
    const url = `${base}/extension/connect?extId=${encodeURIComponent(extId)}&apiBase=${encodeURIComponent(base)}`;
    if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
      chrome.tabs.create({ url, active: true });
    } else {
      window.open(url, '_blank', 'noopener');
    }
  }

  return (
    <form onSubmit={submit} className="w-[360px] space-y-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Time Tracker</h1>
        <button
          type="button"
          onClick={() => setShowSettings((s) => !s)}
          className="text-xs text-zinc-500 underline dark:text-zinc-400"
        >
          {showSettings ? 'Zavřít' : 'API'}
        </button>
      </div>
      {showSettings ? (
        <div className="space-y-2 rounded-md bg-zinc-50 p-2 dark:bg-zinc-800">
          <label className="block text-xs text-zinc-600 dark:text-zinc-400">Adresa serveru</label>
          <input
            value={apiBase}
            onChange={(e) => setApiBaseLocal(e.target.value)}
            placeholder={DEFAULT_API_BASE}
            className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <button
            type="button"
            onClick={saveApiBase}
            className="rounded bg-zinc-900 px-2 py-1 text-xs text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            Uložit
          </button>
        </div>
      ) : null}
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}
      <button
        type="button"
        onClick={openWebLogin}
        className="w-full rounded-md bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Přihlásit se přes web
      </button>
      <p className="text-center text-[10px] text-zinc-500 dark:text-zinc-400">
        Otevře přihlašovací stránku Time Trackeru — podporuje 2FA i magic-link
      </p>
      <div className="relative my-1 flex items-center">
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-700" />
        <span className="mx-2 text-[10px] uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          nebo přímo
        </span>
        <div className="flex-1 border-t border-zinc-200 dark:border-zinc-700" />
      </div>
      <label className="block">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">E-mail</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Heslo</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
        />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Kód 2FA (volitelné)
        </span>
        <input
          inputMode="numeric"
          pattern="\d{6}"
          value={totpCode}
          onChange={(e) => setTotpCode(e.target.value)}
          className="mt-0.5 block w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-zinc-100"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
      >
        {pending ? 'Přihlašuji…' : 'Přihlásit se'}
      </button>
    </form>
  );
}

function AppShell({
  state,
  refreshing,
  fund,
  fundDisplay,
  onSetFundDisplay,
  onChange,
  onLogout,
}: {
  state: AppState;
  refreshing: boolean;
  fund: ExtFundProgress | null;
  fundDisplay: FundDisplay;
  onSetFundDisplay: (v: FundDisplay) => void | Promise<void>;
  onChange: () => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}): ReactElement {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [theme, setThemeState] = useState<ThemePreference>(
    () => state.me.theme ?? readStoredTheme(),
  );
  const [showStats, setShowStats] = useState<boolean>(() => readShowStats());

  // Server's preference is the source of truth — adopt it whenever a refetch
  // (e.g. WS bridge, manual Obnovit) brings a new value.
  useEffect(() => {
    if (state.me.theme && state.me.theme !== theme) setThemeState(state.me.theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.me.theme]);

  // Apply the resolved class on the document, follow OS changes when system.
  useEffect(() => {
    writeStoredTheme(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => applyThemeClass(resolveTheme(theme, mq.matches));
    apply();
    if (theme !== 'system') return;
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);

  function handleSetTheme(next: ThemePreference): void {
    setThemeState(next);
    void updateTheme(state.session, next).catch(() => {
      // Best-effort: localStorage + class already updated; a network blip
      // just delays cross-device sync, doesn't break the popup.
    });
  }

  function handleToggleStats(): void {
    setShowStats((v) => {
      const next = !v;
      writeShowStats(next);
      return next;
    });
  }

  const sync = useExtensionSync({
    session: state.session,
    wsUrl: state.me.wsUrl,
    companyId: state.timer.companyId,
    onRefresh: onChange,
  });

  const [sheet, setSheet] = useState<{
    mode: 'edit' | 'create';
    initial?: EntrySheetInitial;
  } | null>(null);
  const [projectOpen, setProjectOpen] = useState(false);
  const isAdmin = useMemo(
    () => state.me.memberships.find((m) => m.companyId === state.timer.companyId)?.role === 'admin',
    [state.me.memberships, state.timer.companyId],
  );

  function openEdit(id: string): void {
    const all = [...(state.timer.running ?? []), ...(state.timer.history ?? [])];
    const e = all.find((x) => x.id === id);
    if (!e) return;
    setSheet({
      mode: 'edit',
      initial: {
        id: e.id,
        description: e.description,
        note: e.note,
        clientId: e.clientId,
        projectId: e.projectId,
        startedAt: e.startedAt,
        endedAt: e.endedAt,
        tagIds: e.tags.map((t) => t.id),
      },
    });
  }

  return (
    <div className="relative w-[380px] divide-y divide-zinc-100 text-sm dark:divide-zinc-700/60">
      <Header
        me={state.me}
        apiBase={state.session.apiBase}
        online={sync.online}
        pending={sync.pending}
        conflicts={sync.conflicts}
        refreshing={refreshing}
        theme={theme}
        showStats={showStats}
        isAdmin={isAdmin}
        fundDisplay={fundDisplay}
        onManualEntry={() => setSheet({ mode: 'create' })}
        onNewProject={isAdmin ? () => setProjectOpen(true) : null}
        onRefresh={() => void onChange()}
        onSetTheme={handleSetTheme}
        onToggleStats={handleToggleStats}
        onSetFundDisplay={onSetFundDisplay}
        onLogout={onLogout}
      />
      {isAdmin && fundDisplay !== 'off' && fund ? (
        <div className="px-3 py-1.5">
          {fundDisplay === 'combined' ? (
            <FundMiniBar bar={fund.combined.weekly} label="Týden" />
          ) : (
            fund.clients.map((c) => (
              <div key={c.clientId} className="mb-1 last:mb-0">
                <div className="mb-0.5 flex justify-between text-[10px] text-zinc-500 dark:text-zinc-400">
                  <span className="truncate">{c.clientName}</span>
                  <span>
                    {(c.weekly.workedMinutes / 60).toFixed(1)}/
                    {(c.weekly.targetMinutes / 60).toFixed(0)} h
                  </span>
                </div>
                {c.days.length > 0 ? (
                  <div className="flex gap-0.5">
                    {c.days.map((d) => {
                      const g =
                        d.targetMinutes > 0
                          ? Math.min(100, (d.allocatedMinutes / d.targetMinutes) * 100)
                          : 0;
                      const r = d.hasArrived ? 100 - g : 0;
                      return (
                        <div
                          key={d.date}
                          className="flex h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
                        >
                          <div className="h-full bg-emerald-500" style={{ width: `${g}%` }} />
                          <div className="h-full bg-red-500" style={{ width: `${r}%` }} />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <FundMiniBar bar={c.weekly} />
                )}
              </div>
            ))
          )}
        </div>
      ) : null}
      <StartRow catalog={state.catalog} onStart={sync.executeStart} />
      <RunningList
        entries={state.timer.running}
        now={now}
        onStop={sync.executeStop}
        onEdit={openEdit}
      />
      {showStats ? <SummaryCards summary={state.timer.summary} /> : null}
      <HistoryList
        entries={state.timer.history ?? []}
        onPlayAgain={sync.executePlayAgain}
        onDelete={sync.executeDelete}
        onEdit={openEdit}
      />
      {sheet ? (
        <EntrySheet
          mode={sheet.mode}
          catalog={state.catalog}
          nowIso={new Date(now).toISOString()}
          initial={sheet.initial}
          onClose={() => setSheet(null)}
          onSave={sync.executeUpdate}
          onCreate={sync.executeCreateManual}
        />
      ) : null}
      {sync.pendingOverlap ? (
        <AutoStackSheet
          key={sync.pendingOverlap.entryId}
          session={state.session}
          overlap={sync.pendingOverlap}
          onResolved={() => {
            const id = sync.pendingOverlap!.entryId;
            void sync.resolvePendingOverlap(id);
            void onChange();
          }}
          onDismiss={() => void sync.resolvePendingOverlap(sync.pendingOverlap!.entryId)}
        />
      ) : null}
      {projectOpen ? (
        <NewProjectSheet
          catalog={state.catalog}
          onClose={() => setProjectOpen(false)}
          onCreate={sync.executeCreateProject}
        />
      ) : null}
    </div>
  );
}

function openDashboard(apiBase: string): void {
  const url = `${apiBase.replace(/\/$/, '')}/dashboard`;
  if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
    chrome.tabs.create({ url, active: true });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

function Header({
  me: user,
  apiBase,
  online,
  pending,
  conflicts,
  refreshing,
  theme,
  showStats,
  isAdmin,
  fundDisplay,
  onManualEntry,
  onNewProject,
  onRefresh,
  onSetTheme,
  onToggleStats,
  onSetFundDisplay,
  onLogout,
}: {
  me: MeResponse;
  apiBase: string;
  online: boolean;
  pending: number;
  conflicts: number;
  refreshing: boolean;
  theme: ThemePreference;
  showStats: boolean;
  isAdmin: boolean;
  fundDisplay: FundDisplay;
  onManualEntry: () => void;
  onNewProject: (() => void) | null;
  onRefresh: () => void;
  onSetTheme: (t: ThemePreference) => void;
  onToggleStats: () => void;
  onSetFundDisplay: (v: FundDisplay) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}): ReactElement {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
          {user.fullName}
        </div>
        <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
          {user.memberships[0]?.companyName ?? '— bez firmy —'}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {!online ? (
          <span
            className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200"
            title="Offline — změny se uloží do fronty a synchronizují po obnovení připojení"
          >
            Offline
          </span>
        ) : null}
        {refreshing ? (
          <span
            className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
            title="Načítám aktuální data ze serveru"
          >
            Obnovuji…
          </span>
        ) : null}
        {pending > 0 ? (
          <span
            className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-900 dark:bg-blue-900/40 dark:text-blue-200"
            title="Čekající synchronizace"
          >
            ⟳ {pending}
          </span>
        ) : null}
        {conflicts > 0 ? (
          <span
            className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-900 dark:bg-red-900/40 dark:text-red-200"
            title="Konflikty zahozeny serverem"
          >
            ! {conflicts}
          </span>
        ) : null}
        <MoreMenu
          apiBase={apiBase}
          theme={theme}
          showStats={showStats}
          isAdmin={isAdmin}
          fundDisplay={fundDisplay}
          onManualEntry={onManualEntry}
          onNewProject={onNewProject}
          onRefresh={onRefresh}
          onSetTheme={onSetTheme}
          onToggleStats={onToggleStats}
          onSetFundDisplay={onSetFundDisplay}
          onLogout={onLogout}
        />
      </div>
    </div>
  );
}

function FundMiniBar({ bar, label }: { bar: ExtFundBar; label?: string }): ReactElement {
  // Green = worked, red = shortfall against what should be done by now.
  const green =
    bar.targetMinutes > 0 ? Math.min(100, (bar.workedMinutes / bar.targetMinutes) * 100) : 0;
  const shortfall = Math.max(0, bar.expectedToDateMinutes - bar.workedMinutes);
  const red = bar.targetMinutes > 0 ? Math.min(100, (shortfall / bar.targetMinutes) * 100) : 0;
  return (
    <div className="flex items-center gap-1.5">
      {label ? (
        <span className="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">{label}</span>
      ) : null}
      <div className="flex h-1 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
        <div className="h-full bg-emerald-500" style={{ width: `${green}%` }} />
        <div className="h-full bg-red-500" style={{ width: `${red}%` }} />
      </div>
      <span className="shrink-0 text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
        {(bar.workedMinutes / 60).toFixed(1)}/{(bar.targetMinutes / 60).toFixed(0)} h
      </span>
    </div>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Světlý' },
  { value: 'dark', label: 'Tmavý' },
  { value: 'system', label: 'Systémový' },
];

const FUND_DISPLAY_OPTIONS: { value: FundDisplay; label: string }[] = [
  { value: 'off', label: 'Vypnuto' },
  { value: 'combined', label: 'Souhrn' },
  { value: 'per-client', label: 'Po klientech' },
];

function MoreMenu({
  apiBase,
  theme,
  showStats,
  isAdmin,
  fundDisplay,
  onManualEntry,
  onNewProject,
  onRefresh,
  onSetTheme,
  onToggleStats,
  onSetFundDisplay,
  onLogout,
}: {
  apiBase: string;
  theme: ThemePreference;
  showStats: boolean;
  isAdmin: boolean;
  fundDisplay: FundDisplay;
  onManualEntry: () => void;
  onNewProject: (() => void) | null;
  onRefresh: () => void;
  onSetTheme: (t: ThemePreference) => void;
  onToggleStats: () => void;
  onSetFundDisplay: (v: FundDisplay) => void | Promise<void>;
  onLogout: () => void | Promise<void>;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Více"
        className="flex h-7 w-7 items-center justify-center rounded text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700"
      >
        <span aria-hidden className="text-base leading-none">
          ⋯
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-600 dark:bg-zinc-800"
        >
          <div className="border-b border-zinc-100 dark:border-zinc-700">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onManualEntry();
                setOpen(false);
              }}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <span>Přidat ručně</span>
              <span aria-hidden className="text-zinc-400 dark:text-zinc-500">
                +
              </span>
            </button>
            {onNewProject ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onNewProject();
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
              >
                <span>Nový projekt</span>
                <span aria-hidden className="text-zinc-400 dark:text-zinc-500">
                  +
                </span>
              </button>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openDashboard(apiBase);
              setOpen(false);
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <span>Dashboard</span>
            <span aria-hidden className="text-zinc-400 dark:text-zinc-500">
              ↗
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <span>{refreshing ? 'Načítám…' : 'Obnovit'}</span>
            <span aria-hidden className="text-zinc-400 dark:text-zinc-500">
              ⟳
            </span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleStats();
              setOpen(false);
            }}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <span>{showStats ? 'Skrýt statistiky' : 'Zobrazit statistiky'}</span>
            <span aria-hidden className="text-zinc-400 dark:text-zinc-500">
              {showStats ? '◐' : '○'}
            </span>
          </button>
          {isAdmin ? (
            <div
              role="group"
              aria-label="Fond klientů"
              className="border-t border-zinc-100 dark:border-zinc-700"
            >
              <div className="px-3 pt-2 text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Fond klientů
              </div>
              {FUND_DISPLAY_OPTIONS.map((opt) => {
                const active = fundDisplay === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => {
                      void onSetFundDisplay(opt.value);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                  >
                    <span>{opt.label}</span>
                    <span
                      aria-hidden
                      className={active ? 'text-zinc-900 dark:text-zinc-100' : 'text-transparent'}
                    >
                      ✓
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div
            role="group"
            aria-label="Motiv"
            className="border-t border-zinc-100 dark:border-zinc-700"
          >
            <div className="px-3 pt-2 text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Motiv
            </div>
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onSetTheme(opt.value);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  <span>{opt.label}</span>
                  <span
                    aria-hidden
                    className={active ? 'text-zinc-900 dark:text-zinc-100' : 'text-transparent'}
                  >
                    ✓
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
            className="flex w-full items-center justify-between border-t border-zinc-100 px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <span>Odhlásit</span>
            <span aria-hidden className="text-zinc-400 dark:text-zinc-500">
              ⏻
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function fmtHM(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function SummaryCards({ summary }: { summary: TimerSummary | undefined }): ReactElement {
  const s = summary ?? { weekMs: 0, monthMs: 0, lastMonthMs: 0 };
  const cards: { label: string; ms: number }[] = [
    { label: 'Tento týden', ms: s.weekMs },
    { label: 'Tento měsíc', ms: s.monthMs },
    { label: 'Minulý měsíc', ms: s.lastMonthMs },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 p-3">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-center dark:border-zinc-700 dark:bg-zinc-800"
        >
          <div className="truncate text-[9px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {c.label}
          </div>
          <div className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
            {fmtHM(c.ms)}
          </div>
        </div>
      ))}
    </div>
  );
}

function StartRow({
  catalog,
  onStart,
}: {
  catalog: CatalogResponse;
  onStart: (input: StartTimerInput) => Promise<void>;
}): ReactElement {
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projects = useMemo(
    () => catalog.clients.find((c) => c.id === clientId)?.projects ?? [],
    [catalog.clients, clientId],
  );

  function toggleTag(id: string): void {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }

  async function start(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await onStart({
        description,
        clientId: clientId || null,
        projectId: projectId || null,
        tagIds,
      });
      setDescription('');
      setClientId('');
      setProjectId('');
      setTagIds([]);
    } catch {
      setError('Nepodařilo se spustit');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2 p-3">
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Co děláte?"
        className="block w-full rounded border border-zinc-200 bg-white px-2 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-zinc-100"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setProjectId('');
          }}
          className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
        >
          <option value="">— klient —</option>
          {catalog.clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          disabled={!clientId}
          className="rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs text-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
        >
          <option value="">— projekt —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {catalog.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {catalog.tags.map((t) => {
            const active = tagIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => toggleTag(t.id)}
                className="rounded-full border px-2 py-0.5 text-[10px] font-medium"
                style={
                  active
                    ? { backgroundColor: t.color, borderColor: t.color, color: '#fff' }
                    : { borderColor: '#52525b', color: '#a1a1aa' }
                }
              >
                {t.name}
              </button>
            );
          })}
        </div>
      ) : null}
      <button
        type="button"
        onClick={start}
        disabled={pending}
        className="w-full rounded-md bg-zinc-900 py-2 font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
      >
        {pending ? 'Spouštím…' : '▶ Spustit'}
      </button>
    </div>
  );
}

function RunningList({
  entries,
  now,
  onStop,
  onEdit,
}: {
  entries: {
    id: string;
    description: string;
    startedAt: string;
    clientName: string | null;
    projectName: string | null;
  }[];
  now: number;
  onStop: (entryId: string) => Promise<void>;
  onEdit: (entryId: string) => void;
}): ReactElement | null {
  if (entries.length === 0) return null;
  return (
    <div className="space-y-1.5 p-3">
      <div className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Probíhá ({entries.length})
      </div>
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between gap-2 rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-800"
        >
          <button type="button" onClick={() => onEdit(e.id)} className="min-w-0 flex-1 text-left">
            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {e.description || (
                <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
              )}
            </div>
            <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
              {[e.clientName, e.projectName].filter(Boolean).join(' · ') || '—'}
            </div>
          </button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
              {fmtDurationHM(now - new Date(e.startedAt).getTime())}
            </span>
            <button
              type="button"
              onClick={() => void onStop(e.id)}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
            >
              Stop
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryList({
  entries,
  onPlayAgain,
  onDelete,
  onEdit,
}: {
  entries: RecentEntryInput[];
  onPlayAgain: (entryId: string) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  onEdit: (entryId: string) => void;
}): ReactElement {
  const groups = groupRecentByDay(entries, new Date());
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Cancel any in-flight confirmation if the underlying list refreshes the row away.
  useEffect(() => {
    if (pendingDeleteId && !entries.some((e) => e.id === pendingDeleteId)) {
      setPendingDeleteId(null);
    }
  }, [entries, pendingDeleteId]);

  async function confirmDelete(id: string): Promise<void> {
    setPendingDeleteId(null);
    await onDelete(id);
  }

  return (
    <div className="p-3">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Historie
      </div>
      {entries.length === 0 ? (
        <div className="rounded-md bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500">
          Žádné dokončené záznamy
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => {
            const prev = groups[i - 1];
            const showMonth = !prev || prev.monthKey !== g.monthKey;
            return (
              <div key={g.key}>
                {showMonth ? (
                  <div
                    className="mt-2 flex items-center gap-2 pb-1 pt-1 first:mt-0"
                    aria-label={`Měsíc: ${g.monthLabel}`}
                  >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                      {g.monthLabel}
                    </span>
                    <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" aria-hidden />
                  </div>
                ) : null}
                <div
                  className="flex items-baseline gap-2 border-b border-zinc-100 pb-0.5 pt-1 dark:border-zinc-700/60"
                  aria-label={`Skupina: ${g.label}`}
                >
                  <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">
                    {g.label}
                  </span>
                  <span className="h-px flex-1 bg-zinc-100 dark:bg-zinc-700/60" aria-hidden />
                  <span className="font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
                    {fmtDurationHM(g.total)}
                  </span>
                </div>
                <div className="space-y-0.5 pt-1">
                  {g.items.map((e) => {
                    const confirming = pendingDeleteId === e.id;
                    return (
                      <div key={e.id} className="flex items-center justify-between gap-2 px-1 py-1">
                        <button
                          type="button"
                          onClick={() => onEdit(e.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <div className="truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                            {e.description || (
                              <span className="text-zinc-400 dark:text-zinc-500">(bez popisu)</span>
                            )}
                          </div>
                          <div className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                            {[e.clientName, e.projectName].filter(Boolean).join(' · ') || '—'}
                          </div>
                        </button>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[11px] tabular-nums text-zinc-700 dark:text-zinc-300">
                            {e.endedAt
                              ? fmtDurationHM(
                                  new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime(),
                                )
                              : '…'}
                          </span>
                          {confirming ? (
                            <>
                              <span className="text-[10px] text-zinc-600 dark:text-zinc-400">
                                Smazat?
                              </span>
                              <button
                                type="button"
                                title="Potvrdit smazání"
                                onClick={() => void confirmDelete(e.id)}
                                className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                title="Zrušit"
                                onClick={() => setPendingDeleteId(null)}
                                className="rounded border border-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                              >
                                ✗
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                title="Spustit znovu"
                                onClick={() => void onPlayAgain(e.id)}
                                className="rounded px-1.5 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                              >
                                ▶
                              </button>
                              <button
                                type="button"
                                title="Smazat"
                                onClick={() => setPendingDeleteId(e.id)}
                                className="rounded px-1.5 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
