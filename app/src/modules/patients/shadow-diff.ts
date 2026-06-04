/**
 * Pure patient shadow-diff core (P05 T02).
 *
 * DB-free, side-effect-free normalize + diff used by `shadow.ts`. Kept in its own
 * module so it is unit-testable without dragging in the Postgres client / config
 * (which throws when DATABASE_URL is unset). `shadow.ts` re-exports these.
 *
 * Review hardening (P05 cross-AI item 3): `normalizeForComparison` handles raw
 * Mongoose docs — ObjectId → hex string, Date → ISO-8601, strips `__v`/`_id`/
 * Mongoose internals, recursively sorts object keys — so neither store can produce
 * a spurious diff from type representation alone. `normalize` then projects down to
 * the tracked scalar fields, ensuring the 7-day zero-real-drift gate is reachable.
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

// Mongoose internal keys stripped before diffing.
const INTERNAL_KEYS = new Set(['_id', '__v', '__t', '$__', '$isNew', '_doc']);

/**
 * Deep-normalize a raw value for comparison (review hardening item 3).
 *   - ObjectId → lowercase hex string (duck-typed via toHexString())
 *   - Date → ISO-8601 string
 *   - Strips Mongoose internals (_id, __v, __t, etc.)
 *   - Recursively sorts object keys so insertion order never produces false diffs
 *
 * Use this on raw Mongo `.lean()` docs BEFORE projecting to tracked fields.
 * The projected fields in `normalize()` are all scalars (string / number), so
 * ObjectId/Date coercion only matters when a raw doc is passed directly.
 */
export function normalizeForComparison(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  // ObjectId — duck-type: has toHexString method
  if (
    typeof val === 'object' &&
    val !== null &&
    typeof (val as Record<string, unknown>).toHexString === 'function'
  ) {
    return (val as { toHexString(): string }).toHexString();
  }
  if (val instanceof Date) return val.toISOString();
  if (Array.isArray(val)) return val.map(normalizeForComparison);
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (INTERNAL_KEYS.has(key)) continue;
      sorted[key] = normalizeForComparison(obj[key]);
    }
    return sorted;
  }
  return val;
}

/**
 * Reduce either store's result to the canonical mapping shape. `null` => the row
 * is absent in that store (itself a real diff if the other side has it).
 *
 * Accepts both raw Mongo `.lean()` docs (which `shadow.ts` passes through
 * `normalizeForComparison` first) and already-shaped `PatientMapping` objects.
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
