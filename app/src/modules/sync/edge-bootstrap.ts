/**
 * EDGE-06 Plan 01 — idempotent app-startup seed for the drchrono_to_edge sync_controls
 * rows. NOT a migration: the migrate() batch runs entirely inside ONE Postgres
 * transaction, so a statement that USES the 'drchrono_to_edge' enum value (an INSERT)
 * cannot safely share a pending batch with the ADD VALUE that creates it (55P04). This
 * seed runs on its own connection AFTER migrate() has already committed the enum value.
 *
 * Safety: absent control rows already resolve to 'off' via writeModeForEntity's
 * fail-closed floor (see writers/dispatch.ts) — this seed exists ONLY so the control
 * panel has rows to render/toggle, never for write-path safety. A seed failure is
 * swallowed (logged, never thrown) so it can never crash boot.
 */

import { sql } from '../../db/pg/client.js';
import { logger } from '../../logger.js';

const log = logger.child({ module: 'edge-bootstrap' });

/**
 * Idempotently insert the two drchrono_to_edge control rows (off) if absent.
 * ON CONFLICT DO NOTHING — safe to call on every boot. Never throws.
 */
export async function seedEdgeControls(): Promise<void> {
  try {
    await sql`
      INSERT INTO sync_controls (direction, entity, mode, updated_at)
      VALUES
        ('drchrono_to_edge', 'patients', 'off', now()),
        ('drchrono_to_edge', 'appointments', 'off', now())
      ON CONFLICT (direction, entity) DO NOTHING
    `;
    log.info('seedEdgeControls: drchrono_to_edge control rows ensured (off)');
  } catch (err) {
    // Never crash boot on a seed failure — absent rows are already fail-closed to 'off'.
    log.warn({ err }, 'seedEdgeControls: failed to seed drchrono_to_edge control rows (non-fatal)');
  }
}
