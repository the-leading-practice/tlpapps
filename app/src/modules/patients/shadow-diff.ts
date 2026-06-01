/**
 * Pure patient shadow-diff core (P05 T02).
 *
 * DB-free, side-effect-free normalize + diff used by `shadow.ts`. Kept in its own
 * module so it is unit-testable without dragging in the Postgres client / config
 * (which throws when DATABASE_URL is unset). `shadow.ts` re-exports these.
 */
import type { PatientMapping } from './types.js';

export type DiffCategory = 'real' | 'expected';

export interface FieldDiff {
  field: string;
  mongo: unknown;
  pg: unknown;
  category: DiffCategory;
}

// Fields whose drift is tolerated (never categorized `real`, never gates cutover).
export const EXPECTED_DRIFT_FIELDS = new Set<string>(['createdAt', 'updatedAt']);

// Fields compared between the two stores for the patient mapping.
export const TRACKED_FIELDS = ['locationId', 'patientId', 'contactId'] as const;

/**
 * Reduce either store's result to the canonical mapping shape. `null` => the row
 * is absent in that store (itself a real diff if the other side has it).
 */
export function normalize(
  result: (PatientMapping & Record<string, unknown>) | null | undefined,
): Record<string, unknown> | null {
  if (!result) return null;
  return {
    locationId: result.locationId ?? null,
    patientId:
      typeof result.patientId === 'number' ? result.patientId : (result.patientId ?? null),
    contactId: result.contactId ?? null,
  };
}

/**
 * Pure diff of two normalized results. Presence mismatch is a single `real` diff.
 * Field mismatches are `real` unless the field is in EXPECTED_DRIFT_FIELDS.
 */
export function diff(
  mongo: Record<string, unknown> | null,
  pg: Record<string, unknown> | null,
): FieldDiff[] {
  if (mongo === null && pg === null) return [];
  if (mongo === null || pg === null) {
    return [{ field: '__presence__', mongo, pg, category: 'real' }];
  }

  const diffs: FieldDiff[] = [];
  for (const field of TRACKED_FIELDS) {
    const m = mongo[field] ?? null;
    const p = pg[field] ?? null;
    if (m === p) continue;
    diffs.push({
      field,
      mongo: m,
      pg: p,
      category: EXPECTED_DRIFT_FIELDS.has(field) ? 'expected' : 'real',
    });
  }
  return diffs;
}
