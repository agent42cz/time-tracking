import { describe, expect, it } from 'vitest';
import { InMemoryStorageAdapter } from './storage.js';
import { normalizeApiBase, setApiBase, getApiBase, DEFAULT_API_BASE } from './api.js';

describe('normalizeApiBase', () => {
  it('US-31: strips trailing slashes so the service worker fetch URL is valid', () => {
    expect(normalizeApiBase('https://tracker.agent42.cz/')).toBe('https://tracker.agent42.cz');
    expect(normalizeApiBase('https://tracker.agent42.cz///')).toBe('https://tracker.agent42.cz');
    expect(normalizeApiBase('  https://tracker.agent42.cz  ')).toBe('https://tracker.agent42.cz');
  });

  it('US-31: persisted apiBase is stored in canonical form', async () => {
    const storage = new InMemoryStorageAdapter();
    await setApiBase(storage, 'https://tracker.agent42.cz/');
    expect(await getApiBase(storage)).toBe('https://tracker.agent42.cz');
  });

  it('US-31: empty stored apiBase falls back to the build-time default', async () => {
    const storage = new InMemoryStorageAdapter();
    expect(await getApiBase(storage)).toBe(DEFAULT_API_BASE);
  });
});
