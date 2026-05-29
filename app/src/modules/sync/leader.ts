/**
 * P07 cron leader-election helper — SKELETON. The full event-driven sync engine
 * (cron loop, event processing, mappers, routes) is Phase 08, owned by the
 * DrChrono team. This file ships only the PG advisory-lock primitives they build
 * against; NOTHING here is wired into boot in P07 (behavior-neutral). The cron
 * loop that calls `acquireLock` is gated behind `config.runCron` in P08.
 *
 * Why advisory locks (revised decision D-04): replaces the original Mongo TTL
 * lease. `pg_try_advisory_lock` is a non-blocking, session-scoped lock — exactly
 * one connection across the whole cluster can hold a given key. Because the lock
 * is bound to the Postgres SESSION (the `postgres` pool connection), it is
 * released automatically when that session ends: a crashed/killed replica drops
 * its TCP connection, Postgres reaps the session, and the lock frees with no TTL
 * to wait out and no stale-lease window. There is no lease renewal to manage.
 *
 * Key composition: the two-arg `pg_try_advisory_lock(key1 int, key2 int)` form is
 * used as `(config.syncLeaderKeyBase, hashtext(kind)::int)`. `key1` namespaces all
 * of this app's locks so a `hashtext(kind)` value can never collide with an
 * unrelated advisory-lock user on the same PG instance; `key2` separates job kinds.
 *
 * CAVEAT — pooled connections: `pg_try_advisory_lock` is session-scoped, but the
 * shared `postgres` pool hands out different connections per query. A real holder
 * therefore needs a single pinned connection for the lock's lifetime (e.g.
 * `sql.reserve()` or a dedicated leader connection). P08 owns that wiring; these
 * helpers are the minimal building blocks.
 */

import { sql } from '../../db/pg/client.js';
import { config } from '../../config.js';

/**
 * Try to acquire the cluster-wide leader lock for a given job `kind` without
 * blocking. Returns `true` if this session now holds the lock, `false` if another
 * session already holds it.
 *
 * NOTE: lock ownership is tied to the connection that ran this statement. With the
 * shared pool, hold the lock on a pinned connection (P08) rather than the pool.
 */
export async function acquireLock(kind: string): Promise<boolean> {
  const rows = await sql<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${config.syncLeaderKeyBase}, hashtext(${kind})::int) AS locked
  `;
  return rows[0]?.locked === true;
}

/**
 * Release a previously acquired leader lock for `kind`. Returns `true` if a lock
 * held by this session was released, `false` if no matching lock was held. Locks
 * also auto-release when the owning session ends, so explicit release is a clean
 * hand-off, not a correctness requirement.
 */
export async function releaseLock(kind: string): Promise<boolean> {
  const rows = await sql<{ released: boolean }[]>`
    SELECT pg_advisory_unlock(${config.syncLeaderKeyBase}, hashtext(${kind})::int) AS released
  `;
  return rows[0]?.released === true;
}
