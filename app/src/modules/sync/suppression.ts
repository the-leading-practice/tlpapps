/**
 * SAFETY guard — automation suppression for synced GHL contacts.
 *
 * Synced patients must NEVER trigger GHL automation workflows ("Contact Created → SMS",
 * reminder sequences) during backfill/migration. The owner's suppression convention:
 * every synced contact carries the `GHL_SUPPRESS_TAG` tag (default "Existing Patient"),
 * and their GHL workflows are filtered to exclude that tag. A flag-gated DND backstop
 * (`GHL_SUPPRESS_AUTOMATION`, default on) additionally forces `dnd:true`.
 *
 * Applies to CONTACT bodies ONLY — never appointments. Env is read lazily (not via the
 * frozen config object) so the flag can be toggled per call/test, matching dispatch.ts.
 */

/** Suppression tag injected into every synced contact's `tags` array. */
export function suppressTag(env: NodeJS.ProcessEnv = process.env): string {
  return env.GHL_SUPPRESS_TAG || 'Existing Patient';
}

/** Whether the DND automation backstop is active (default true). */
export function suppressAutomation(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GHL_SUPPRESS_AUTOMATION !== 'false';
}

/**
 * Resolve the suppression tag against a LOCATION's actual stored tag spellings.
 *
 * Why: the tag may be spelled differently per GHL location (casing, plural). GHL stores
 * ONE canonical spelling per location and the workflow filter is keyed to that exact
 * spelling. Sending a differently-spelled literal makes GHL mint a NEW tag the filter
 * won't catch — and the automation fires. So reuse the account's EXACT stored spelling.
 *
 * Match is case- and trim-insensitive. On match → account's exact stored spelling +
 * matched:true. No match → configured literal + matched:false (caller should warn: the
 * tag is absent from the location, so its workflow filter can't exist either).
 */
export function resolveSuppressTag(
  locationTags: string[],
  configured: string,
): { tag: string; matched: boolean } {
  const needle = configured.trim().toLowerCase();
  for (const t of locationTags) {
    if (t.trim().toLowerCase() === needle) {
      return { tag: t, matched: true };
    }
  }
  return { tag: configured, matched: false };
}

/**
 * Return a copy of a CONTACT body with the suppression tag merged into `tags`
 * (deduped, existing tags preserved) and `dnd` forced true when the backstop flag
 * is on. When the flag is off, `dnd` is left exactly as the caller set it.
 *
 * `resolvedTag` (from resolveSuppressTag against the location's actual tags) wins when
 * provided so the account's EXACT stored spelling is used; else fall back to the env
 * literal. Existing call sites pass none → unchanged behavior.
 */
export function applyContactSuppression(
  body: Record<string, unknown>,
  resolvedTag?: string,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  const tag = resolvedTag ?? suppressTag(env);
  const existing = Array.isArray(body.tags) ? (body.tags as unknown[]) : [];
  const tags = Array.from(new Set([...existing, tag]));
  const next: Record<string, unknown> = { ...body, tags };
  if (suppressAutomation(env)) {
    next.dnd = true;
  }
  return next;
}
