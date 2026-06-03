/**
 * verify-suppression.ts — SAFETY harness proving the automation-suppression guard
 * (Existing-Patient tag + DND backstop + account-exact tag spelling) actually stops
 * synced contacts from firing GHL automation workflows.
 *
 * Two phases:
 *
 *   Phase A — OFFLINE body assertion (DEFAULT, always runs, ZERO network):
 *     Build N synthetic contact payloads and push each through the real contact write
 *     path in `verify` write mode. The verify-sink captures the EXACT outgoing envelope
 *     without touching GHL. Assert every captured CONTACT body carries the suppression
 *     tag and (when GHL_SUPPRESS_AUTOMATION on) dnd:true, and that an APPOINTMENT body
 *     carries NO suppression tag. Fails loudly if any contact would go out untagged.
 *
 *   Phase B — LIVE demo proof (OPT-IN, heavily guarded):
 *     Runs ONLY with `--live` AND when --location is in the hardcoded DEMO allowlist
 *     (exactly `wP3Ynm3Z63rIC4zVAgXP`). For any other location, or without --live, it
 *     REFUSES (exit non-zero). Never runs against a non-demo / production location.
 *     Steps per synthetic contact:
 *       1. resolve the demo access token via getLocationAccessToken
 *       2. resolve the account-exact suppression tag via resolveLocationSuppressTag
 *       3. create the contact through the real `on` write path (POST /contacts/upsert)
 *       4. verify the contact carries the resolved tag (GET /contacts/{id})
 *       5. verify NO automation fired — proxy signal: ZERO conversations/messages exist
 *          for the contact (GET /conversations/search?locationId&contactId). GHL exposes
 *          no public "list workflow enrollments" endpoint, so messages=0 is the best
 *          available signal; eyeball the workflow history in the UI for full assurance.
 *       6. cleanup: best-effort DELETE /contacts/{id}.
 *     All synthetic data is clearly labelled (name prefix ZZ_SUPPRESS_TEST_, unique email)
 *     and deleted on completion.
 *
 * Usage:
 *   npm run verify:suppression                       # Phase A only, no network
 *   tsx scripts/verify-suppression.ts --count 5      # Phase A, 5 synthetic contacts
 *   tsx scripts/verify-suppression.ts --live --location wP3Ynm3Z63rIC4zVAgXP   # + Phase B
 *
 * Phase B requires DB connectivity (token resolution reuses the identity token store) and
 * a real GHL token row for the demo location — supplied by the owner, not the build.
 *
 * This script NEVER mutates production. It is additive tooling — the engine/suppression
 * modules are not modified.
 */

// Inert sentinel so importing the dispatch/config graph (which pulls the pg client
// transitively) succeeds for Phase A without a real DATABASE_URL. Phase B overrides this
// from the real environment (.env) loaded by config.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

import http from 'node:http';
import { AddressInfo } from 'node:net';

// ── DEMO allowlist — the ONLY location Phase B may ever touch ──────────────────
// Hardcoded on purpose: a live run against anything not in this set is refused.
const DEMO_LOCATION_ALLOWLIST = ['wP3Ynm3Z63rIC4zVAgXP'] as const;

// Synthetic-data markers — make every test artifact obviously fake + uniquely keyed.
const SYNTH_NAME_PREFIX = 'ZZ_SUPPRESS_TEST_';
const SYNTH_EMAIL_DOMAIN = 'suppress-test.invalid'; // RFC2606 reserved → never deliverable

// ── Args ──────────────────────────────────────────────────────────────────────

export interface Args {
  live: boolean;
  location: string | null;
  count: number;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { live: false, location: null, count: 3 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--live') args.live = true;
    else if (a === '--location') args.location = argv[++i] ?? null;
    else if (a === '--count') {
      const n = parseInt(argv[++i] ?? '', 10);
      args.count = Number.isFinite(n) && n > 0 ? n : 3;
    }
  }
  return args;
}

/** Demo-location guard — the SINGLE gate that authorizes a live run. Pure + unit-tested. */
export function isDemoRunAllowed(args: Args): { ok: boolean; reason?: string } {
  if (!args.live) return { ok: false, reason: 'live mode not requested (--live absent)' };
  if (!args.location)
    return { ok: false, reason: '--live requires --location <demo location id>' };
  if (!(DEMO_LOCATION_ALLOWLIST as readonly string[]).includes(args.location)) {
    return {
      ok: false,
      reason: `location ${args.location} is NOT in the demo allowlist [${DEMO_LOCATION_ALLOWLIST.join(', ')}] — refusing live run`,
    };
  }
  return { ok: true };
}

// ── Synthetic payload builders ──────────────────────────────────────────────────

/** Build N synthetic CONTACT bodies, clearly labelled + uniquely keyed. */
export function buildSyntheticContacts(n: number, runId: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      firstName: `${SYNTH_NAME_PREFIX}${runId}`,
      lastName: `Case${i + 1}`,
      email: `zz-suppress-${runId}-${i + 1}@${SYNTH_EMAIL_DOMAIN}`,
      tags: ['VIP'], // a pre-existing tag, to prove the suppress tag MERGES (not replaces)
    });
  }
  return out;
}

// ── Phase A — offline body assertion (no network) ───────────────────────────────

export interface PhaseACheck {
  index: number;
  hasSuppressTag: boolean;
  hasDnd: boolean;
  pass: boolean;
  reason?: string;
}

export interface PhaseAResult {
  pass: boolean;
  expectDnd: boolean;
  suppressTag: string;
  contactChecks: PhaseACheck[];
  appointmentTagged: boolean; // must be false
}

async function runPhaseA(count: number): Promise<PhaseAResult> {
  // Import lazily so unit tests of the pure helpers never spin the dispatch graph.
  const { dispatchWrite } = await import('../src/modules/sync/writers/dispatch.js');
  const { suppressTag, suppressAutomation } = await import('../src/modules/sync/suppression.js');

  const tag = suppressTag();
  const expectDnd = suppressAutomation();
  const runId = Date.now().toString(36);

  // In-process sink listener — captures envelopes over real localhost HTTP (proves the
  // wire path) while NEVER reaching GHL. Mirrors demo-verify-sink.ts.
  const captured: any[] = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        captured.push(JSON.parse(raw));
      } catch {
        captured.push({ parseError: raw });
      }
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ captured: true }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  process.env.SYNC_VERIFY_SINK_URL = `http://127.0.0.1:${port}/api/sync/verify-sink`;

  const contactChecks: PhaseACheck[] = [];
  try {
    const contacts = buildSyntheticContacts(count, runId);
    for (let i = 0; i < contacts.length; i++) {
      await dispatchWrite(
        {
          eventId: `phaseA-contact-${runId}-${i}`,
          target: 'ghl',
          entity: 'contact',
          verb: 'create',
          body: contacts[i],
        },
        { mode: 'verify', retryDelayFactor: 0 },
      );
      const env = captured[captured.length - 1];
      const body = env?.wouldHaveSent?.body ?? {};
      const tags: unknown[] = Array.isArray(body.tags) ? body.tags : [];
      const hasSuppressTag = tags.includes(tag);
      const hasDnd = body.dnd === true;
      const dndOk = expectDnd ? hasDnd : true;
      const pass = hasSuppressTag && dndOk;
      contactChecks.push({
        index: i,
        hasSuppressTag,
        hasDnd,
        pass,
        reason: pass
          ? undefined
          : !hasSuppressTag
            ? `contact body would go out WITHOUT suppression tag "${tag}"`
            : `GHL_SUPPRESS_AUTOMATION on but dnd!==true`,
      });
    }

    // Appointment control: an appointment body must carry NO suppression tag.
    await dispatchWrite(
      {
        eventId: `phaseA-appt-${runId}`,
        target: 'ghl',
        entity: 'appointment',
        verb: 'create',
        body: { calendarId: 'cal-synthetic', title: 'synthetic' },
      },
      { mode: 'verify', retryDelayFactor: 0 },
    );
    const apptEnv = captured[captured.length - 1];
    const apptBody = apptEnv?.wouldHaveSent?.body ?? {};
    const apptTags: unknown[] = Array.isArray(apptBody.tags) ? apptBody.tags : [];
    const appointmentTagged = apptTags.includes(tag);

    const pass = contactChecks.every((c) => c.pass) && !appointmentTagged;
    return { pass, expectDnd, suppressTag: tag, contactChecks, appointmentTagged };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function printPhaseA(r: PhaseAResult): void {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('PHASE A — offline body assertion (zero network)');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`suppress tag: "${r.suppressTag}"   expect dnd:true = ${r.expectDnd}`);
  for (const c of r.contactChecks) {
    const mark = c.pass ? 'PASS' : 'FAIL';
    console.log(
      `  contact[${c.index}] ${mark} — tag:${c.hasSuppressTag} dnd:${c.hasDnd}` +
        (c.reason ? `  (${c.reason})` : ''),
    );
  }
  console.log(
    `  appointment carries suppression tag: ${r.appointmentTagged} ` +
      `${r.appointmentTagged ? 'FAIL (must be false)' : 'PASS'}`,
  );
  console.log(`PHASE A: ${r.pass ? 'PASS' : 'FAIL'}`);
}

// ── Phase B — live demo proof (guarded) ─────────────────────────────────────────

interface PhaseBContactResult {
  index: number;
  contactId: string | null;
  hasResolvedTag: boolean;
  conversationCount: number; // 0 => no automation fired (proxy)
  noAutomation: boolean;
  deleted: boolean;
  pass: boolean;
  reason?: string;
}

interface PhaseBResult {
  pass: boolean;
  resolvedTag: string;
  results: PhaseBContactResult[];
}

async function runPhaseB(location: string, count: number): Promise<PhaseBResult> {
  const { config } = await import('../src/config.js');
  const { fetchJson } = await import('../src/utils/fetch.js');
  const { ghlWrite } = await import('../src/modules/sync/writers/ghl.js');
  const { getLocationAccessToken } = await import('../src/modules/sync/location-token.js');
  const { resolveLocationSuppressTag } = await import('../src/modules/sync/location-tags.js');

  const base = config.ghl.apiUrl;
  const version = config.ghl.apiVersion;
  const runId = Date.now().toString(36);

  const token = await getLocationAccessToken(location);
  if (!token) {
    throw new Error(
      `could not resolve a GHL access token for demo location ${location} — ` +
        `owner must seed a token row (login the demo location) before Phase B`,
    );
  }
  const resolvedTag = await resolveLocationSuppressTag(location, token);
  console.log(`\nresolved suppression tag for ${location}: "${resolvedTag}"`);

  const ghlGet = async (url: string) =>
    fetchJson(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, version },
    });

  const contacts = buildSyntheticContacts(count, runId);
  const results: PhaseBContactResult[] = [];

  for (let i = 0; i < contacts.length; i++) {
    const r: PhaseBContactResult = {
      index: i,
      contactId: null,
      hasResolvedTag: false,
      conversationCount: -1,
      noAutomation: false,
      deleted: false,
      pass: false,
    };
    try {
      // 1) create through the real `on` path. ghlWrite injects the suppression tag + DND
      //    and (with token+locationId) resolves the account-exact tag spelling itself.
      const created = await ghlWrite(
        {
          eventId: `phaseB-${runId}-${i}`,
          entity: 'contact',
          verb: 'create',
          token,
          locationId: location,
          body: { ...contacts[i], locationId: location },
        },
        undefined,
        { delayFactor: 0 },
      );
      const cd = created.data as any;
      const contactId =
        cd?.contact?.id ?? cd?.id ?? cd?.contactId ?? null;
      r.contactId = contactId;
      if (!contactId) {
        r.reason = 'create returned no contact id';
        results.push(r);
        continue;
      }

      // 2) verify the contact carries the resolved tag.
      const got = await ghlGet(`${base}/contacts/${contactId}`);
      const gtags: unknown[] = (got.data as any)?.contact?.tags ?? [];
      r.hasResolvedTag = gtags
        .map((t) => String(t).trim().toLowerCase())
        .includes(resolvedTag.trim().toLowerCase());

      // 3) verify NO automation fired — proxy: zero conversations/messages for the contact.
      //    GHL has no public "list enrollments" endpoint; conversations=0 is the signal.
      const conv = await ghlGet(
        `${base}/conversations/search?locationId=${encodeURIComponent(location)}&contactId=${encodeURIComponent(contactId)}`,
      );
      const convArr: unknown[] = (conv.data as any)?.conversations ?? [];
      const total =
        typeof (conv.data as any)?.total === 'number'
          ? (conv.data as any).total
          : convArr.length;
      r.conversationCount = total;
      r.noAutomation = total === 0;

      r.pass = r.hasResolvedTag && r.noAutomation;
      if (!r.pass) {
        r.reason = !r.hasResolvedTag
          ? `contact missing resolved tag "${resolvedTag}"`
          : `automation signal: ${total} conversation(s) exist (expected 0)`;
      }
    } catch (e) {
      r.reason = `error: ${(e as Error).message}`;
    } finally {
      // 4) cleanup — best-effort delete of the synthetic contact.
      if (r.contactId) {
        try {
          const del = await fetchJson(`${base}/contacts/${r.contactId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}`, version },
          });
          r.deleted = del.status >= 200 && del.status < 300;
        } catch {
          r.deleted = false;
        }
      }
      results.push(r);
    }
  }

  const pass = results.length > 0 && results.every((r) => r.pass);
  return { pass, resolvedTag, results };
}

function printPhaseB(r: PhaseBResult): void {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('PHASE B — LIVE demo proof (demo location only)');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`resolved tag: "${r.resolvedTag}"`);
  console.log('  (no-automation signal = zero conversations/messages for the new contact)');
  for (const c of r.results) {
    const mark = c.pass ? 'PASS' : 'FAIL';
    console.log(
      `  contact[${c.index}] ${mark} — id:${c.contactId ?? 'none'} ` +
        `tag:${c.hasResolvedTag} conversations:${c.conversationCount} ` +
        `cleanedUp:${c.deleted}` +
        (c.reason ? `  (${c.reason})` : ''),
    );
  }
  console.log(`PHASE B: ${r.pass ? 'PASS' : 'FAIL'}`);
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const a = await runPhaseA(args.count);
  printPhaseA(a);

  let bPass = true;
  if (args.live || args.location) {
    const gate = isDemoRunAllowed(args);
    if (!gate.ok) {
      console.error('\n✗ Phase B refused: ' + gate.reason);
      console.error('  Phase B requires: --live AND --location wP3Ynm3Z63rIC4zVAgXP');
      process.exit(2);
    }
    // Phase B reads the demo location's encrypted token from the identity store (Mongo),
    // so a live DB connection is required before token resolution. Phase A never reaches here.
    const { connectDB } = await import('../src/db.js');
    await connectDB();
    const b = await runPhaseB(args.location!, args.count);
    printPhaseB(b);
    bPass = b.pass;
  } else {
    console.log('\n(Phase B skipped — pass --live --location <demo> to run the live proof.)');
  }

  console.log('\n══════════════════════════════════════════════════════════════');
  const overall = a.pass && bPass;
  console.log(`OVERALL: ${overall ? 'PASS ✅' : 'FAIL ✗'}`);
  process.exit(overall ? 0 : 1);
}

// Auto-run only when invoked directly (not when imported by a test).
const isDirect = process.argv[1] && process.argv[1].endsWith('verify-suppression.ts');
if (isDirect) {
  main().catch((err) => {
    console.error('verify-suppression failed:', err);
    process.exit(1);
  });
}
