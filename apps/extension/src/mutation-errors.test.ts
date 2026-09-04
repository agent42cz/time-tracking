/**
 * AIAGE-66: when Cloudflare Access started intercepting the API, the popup told
 * the user nothing — the start silently landed in the offline queue and the only
 * visible trace was the "unsynced" badge. These cover the two decisions that
 * follow a failed mutation: what the user is told, and how the replay loop
 * classifies the failure.
 */
import { describe, expect, it } from 'vitest';
import { AccessBlockedError, ApiError } from './api.js';
import { classifyReplayFailure, connectionErrorMessage, mutationErrorMessage } from './sync.js';

describe('mutationErrorMessage', () => {
  it('US-34: a blocked request says the server is unreachable through a proxy, not "try again"', () => {
    const msg = mutationErrorMessage(
      new AccessBlockedError('https://tracker.agent42.cz/api/v1/timer'),
    );
    expect(msg).toContain('proxy');
  });

  it('US-34: an API error falls back to the generic start failure', () => {
    expect(mutationErrorMessage(new ApiError(500, 'boom'))).toBe('Nepodařilo se spustit');
  });

  it('US-34: an unknown error falls back to the generic start failure', () => {
    expect(mutationErrorMessage(new Error('???'))).toBe('Nepodařilo se spustit');
  });
});

describe('connectionErrorMessage', () => {
  it('US-34: a blocked load names the proxy instead of blaming the connection', () => {
    expect(
      connectionErrorMessage(new AccessBlockedError('https://tracker.agent42.cz/api/v1/me')),
    ).toContain('proxy');
  });

  it('US-34: a genuine transport failure keeps the connection message', () => {
    expect(connectionErrorMessage(new TypeError('Failed to fetch'))).toBe(
      'Nelze se připojit k serveru',
    );
  });
});

describe('classifyReplayFailure', () => {
  it('US-34: a blocked replay is transient — the queue survives until the proxy is fixed', () => {
    expect(classifyReplayFailure(new AccessBlockedError('https://x/api'))).toEqual({
      reason: 'transient',
      blocked: true,
    });
  });

  it('US-34: a server response is a conflict and drops the mutation', () => {
    expect(classifyReplayFailure(new ApiError(409, 'conflict'))).toEqual({
      reason: 'conflict',
      blocked: false,
    });
  });

  it('US-34: a transport failure is transient and keeps the mutation', () => {
    expect(classifyReplayFailure(new TypeError('Failed to fetch'))).toEqual({
      reason: 'transient',
      blocked: false,
    });
  });
});
