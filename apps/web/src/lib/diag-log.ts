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
import { createHash } from 'node:crypto';

export interface TimerDiagEntry {
  actorUserId: string;
  entryId: string | null;
  /**
   * `'mcp'` is currently unreachable: the MCP `start_timer`/`stop_timer` tools
   * call the `startTimer`/`stopTimer` service functions directly and never go
   * through the `v1/timer` HTTP routes where `logTimerDiag` is called. Kept in
   * the union for when that changes rather than removed, but until then an
   * MCP-originated start/stop does not appear in this timeline — don't assume
   * it's complete.
   */
  source: 'web' | 'extension' | 'mcp';
  action: 'start' | 'stop';
  outcome: 'ok' | 'conflict' | 'error';
}

/**
 * Correlation needs a *stable* actor key, not an identifying one — the timeline
 * only has to group one user's events across surfaces. So the raw user id never
 * reaches the log: a truncated SHA-256 is just as groupable and keeps user ids
 * out of whatever aggregator retains container output.
 */
function actorKey(userId: string): string {
  return createHash('sha256').update(userId, 'utf8').digest('hex').slice(0, 12);
}

export function logTimerDiag(entry: TimerDiagEntry): void {
  if (process.env.TT_DIAG !== '1') return;
  try {
    const { actorUserId, ...rest } = entry;
    process.stdout.write(
      `${JSON.stringify({
        tag: 'tt:diag',
        ts: new Date().toISOString(),
        actor: actorKey(actorUserId),
        ...rest,
      })}\n`,
    );
  } catch {
    // Diagnostics must never break a request.
  }
}
