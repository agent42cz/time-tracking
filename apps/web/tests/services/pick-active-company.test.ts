import { expect, it } from 'vitest';
import type { ApiSession } from '../../src/lib/api/auth.js';
import { pickActiveCompany } from '../../src/lib/api/auth.js';

function session(partial: Partial<ApiSession> & Pick<ApiSession, 'memberships'>): ApiSession {
  return {
    userId: 'u1',
    email: 'u@test.cz',
    fullName: 'U',
    totpEnabled: false,
    theme: 'system',
    autoStackOverlaps: false,
    authSource: 'web',
    cookieCompanyId: null,
    ...partial,
  };
}

const first = {
  companyId: 'co-1',
  companyName: 'First',
  companySlug: 'first',
  role: 'admin' as const,
};
const second = {
  companyId: 'co-2',
  companyName: 'Second',
  companySlug: 'second',
  role: 'admin' as const,
};

it('US-7: web requests without ?company= keep the cookie company instead of the first membership', () => {
  const active = pickActiveCompany(
    session({
      authSource: 'web',
      cookieCompanyId: 'co-2',
      memberships: [first, second],
    }),
    null,
  );
  expect(active).toEqual({ companyId: 'co-2', role: 'admin' });
});

it('US-7: an explicit company query still wins over the web cookie and never falls back', () => {
  const hit = pickActiveCompany(
    session({
      authSource: 'web',
      cookieCompanyId: 'co-2',
      memberships: [first, second],
    }),
    'co-1',
  );
  expect(hit).toEqual({ companyId: 'co-1', role: 'admin' });
  expect(
    pickActiveCompany(
      session({
        authSource: 'web',
        cookieCompanyId: 'co-2',
        memberships: [first, second],
      }),
      'missing',
    ),
  ).toBeNull();
});

it('US-7: bearer requests ignore the web cookie and keep the token default when no company is named', () => {
  const active = pickActiveCompany(
    session({
      authSource: 'extension',
      cookieCompanyId: 'co-2',
      memberships: [first, second],
    }),
    null,
  );
  expect(active).toEqual({ companyId: 'co-1', role: 'admin' });
});
