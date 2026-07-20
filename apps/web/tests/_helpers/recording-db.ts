/**
 * A **recording** Prisma client — instrumentation, not a mock. Read this before
 * flagging it against the constitution's "zero DB mocks" rule
 * (`docs/constitution.md:20`, `:58`).
 *
 * `recordingDb(tx)` wraps the real `withTx` transaction client in a `Proxy` that
 * forwards *every* call, unaltered, to the real testcontainer Postgres and merely
 * records the arguments on the way through. Nothing is stubbed, faked, replayed
 * or short-circuited: the queries execute, the rows change, and the behavioural
 * assertions around them still hold. Delete the recorder and the tests still run
 * the same SQL.
 *
 * It exists because some invariants are invisible from outside the database.
 * Dropping `deletedAt: { lt: cutoff }` from `purgeOldDeleted`'s DELETE cannot be
 * caught by observing rows — the `id: { in: … }` clause alone already excludes
 * every entry a black-box test can set up — and yet its absence is a silent,
 * irreversible data-loss bug the instant a user restores an entry mid-run. The
 * predicate's *presence on the write* is the invariant, so the test asserts on
 * the write.
 *
 * The race those predicates guard cannot be reproduced here: `withTx` pins the
 * whole test to one transaction, so a concurrent writer would deadlock. The
 * predicate, however, is observable — and it is the thing a one-token edit can
 * remove.
 */
import type { TxClient } from '@tt/db/test';

export interface RecordedCall {
  model: string;
  method: string;
  args: unknown[];
}

/** Only these delegates are recorded; everything else passes straight through. */
const RECORDED_MODELS = ['timeEntry', 'auditLog'] as const;

type RecordedModel = (typeof RECORDED_MODELS)[number];

function isRecordedModel(prop: string | symbol): prop is RecordedModel {
  return typeof prop === 'string' && (RECORDED_MODELS as readonly string[]).includes(prop);
}

type DelegateMethod = (...args: unknown[]) => unknown;

function recordDelegate<T extends object>(
  model: RecordedModel,
  delegate: T,
  calls: RecordedCall[],
): T {
  return new Proxy(delegate, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (typeof prop !== 'string' || typeof value !== 'function') return value;
      const method = value as DelegateMethod;
      return (...args: unknown[]): unknown => {
        calls.push({ model, method: prop, args });
        // Straight through to the real client, bound to the real delegate.
        return method.apply(target, args);
      };
    },
  });
}

export interface RecordingDb {
  /** Pass where a service expects its `Db`. Every call reaches real Postgres. */
  db: TxClient;
  /** Every call made to a recorded delegate, in order. */
  calls: RecordedCall[];
}

export function recordingDb(tx: TxClient): RecordingDb {
  const calls: RecordedCall[] = [];
  const db = new Proxy(tx, {
    get(target, prop) {
      const value: unknown = Reflect.get(target, prop);
      if (isRecordedModel(prop) && typeof value === 'object' && value !== null) {
        return recordDelegate(prop, value, calls);
      }
      return value;
    },
  });
  return { db, calls };
}

/** The recorded calls to `db.<model>.<method>(…)`, in call order. */
export function callsTo(calls: RecordedCall[], model: string, method: string): RecordedCall[] {
  return calls.filter((c) => c.model === model && c.method === method);
}

/** The first argument of the single expected call to `db.<model>.<method>(…)`. */
export function soleCallArg(calls: RecordedCall[], model: string, method: string): unknown {
  const matched = callsTo(calls, model, method);
  if (matched.length !== 1) {
    throw new Error(`expected exactly 1 call to ${model}.${method}, saw ${matched.length}`);
  }
  return matched[0]?.args[0];
}
