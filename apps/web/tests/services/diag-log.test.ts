import { afterEach, describe, expect, it, vi } from 'vitest';
import { logTimerDiag } from '../../src/lib/diag-log.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.TT_DIAG;
});

const entry = {
  actorUserId: 'u1',
  entryId: 'e1',
  source: 'extension' as const,
  action: 'stop' as const,
  outcome: 'ok' as const,
};

describe('logTimerDiag', () => {
  it('US-104: writes nothing unless TT_DIAG is enabled', () => {
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    logTimerDiag(entry);
    expect(write).not.toHaveBeenCalled();
  });

  it('US-104: writes one JSON line per call when enabled', () => {
    process.env.TT_DIAG = '1';
    const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

    logTimerDiag(entry);

    expect(write).toHaveBeenCalledTimes(1);
    const line = write.mock.calls[0]![0] as string;
    expect(line.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({
      tag: 'tt:diag',
      actorUserId: 'u1',
      entryId: 'e1',
      source: 'extension',
      action: 'stop',
      outcome: 'ok',
    });
    expect(typeof parsed.ts).toBe('string');
  });

  it('US-104: a stdout failure never propagates to the caller', () => {
    process.env.TT_DIAG = '1';
    vi.spyOn(process.stdout, 'write').mockImplementation(() => {
      throw new Error('EPIPE');
    });
    expect(() => logTimerDiag(entry)).not.toThrow();
  });
});
