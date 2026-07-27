/**
 * One JSON line per timer mutation (US-104), gated behind TT_DIAG.
 *
 * Every surface — web tab, extension popup, MCP, any Chrome profile — hits this
 * server, so this is the only place that can produce a single ordered timeline
 * across all of them. Per-client buffers cannot.
 *
 * Written with process.stdout.write rather than console, which is banned in
 * apps/** by local/no-console-in-src.
 */
export interface TimerDiagEntry {
  actorUserId: string;
  entryId: string | null;
  source: 'web' | 'extension' | 'mcp';
  action: 'start' | 'stop';
  outcome: 'ok' | 'conflict' | 'error';
}

export function logTimerDiag(entry: TimerDiagEntry): void {
  if (process.env.TT_DIAG !== '1') return;
  try {
    process.stdout.write(
      `${JSON.stringify({ tag: 'tt:diag', ts: new Date().toISOString(), ...entry })}\n`,
    );
  } catch {
    // Diagnostics must never break a request.
  }
}
