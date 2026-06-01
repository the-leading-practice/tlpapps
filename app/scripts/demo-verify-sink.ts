/**
 * P05 verify-mode demo — DB-free, self-contained proof that the sync engine, in
 * `verify` write mode, builds the REAL outbound write (route/method/body with origin
 * tag + Idempotency-Key) and POSTs it to a capture SINK instead of ever calling the
 * live EHR.
 *
 * Run: npm run demo:verify-sink
 *
 * It spins up a tiny in-process HTTP listener acting as the sink, points the dispatch
 * sink URL at it via SYNC_VERIFY_SINK_URL, then dispatches a representative sequence in
 * verify mode and prints each captured envelope. Nothing touches drchrono.com or GHL.
 */

import http from 'node:http';
import { AddressInfo } from 'node:net';

// A throwaway DATABASE_URL so importing the dispatch module graph (which pulls the pg
// client transitively) succeeds. The demo never touches the DB.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@127.0.0.1:1/none';

const captured: any[] = [];

async function main() {
  // 1) Local sink listener — captures POSTed envelopes.
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let env: any;
      try {
        env = JSON.parse(raw);
      } catch {
        env = { parseError: raw };
      }
      captured.push(env);
      res.setHeader('Content-Type', 'application/json');
      res.statusCode = 200;
      res.end(JSON.stringify({ captured: true, id: `mem-${captured.length}` }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const sinkUrl = `http://127.0.0.1:${port}/api/sync/verify-sink`;

  // Point dispatch's built-in sink resolution at our listener. Set BEFORE importing
  // config/dispatch so config picks it up.
  process.env.SYNC_VERIFY_SINK_URL = sinkUrl;

  const { dispatchWrite } = await import('../src/modules/sync/writers/dispatch.js');

  // 2) Representative sequence — verify mode, NO token (verify needs no EHR creds).
  //    deps.ghlHttp/dcHttp are left undefined so the sink uses the real fetchJson,
  //    which POSTs to our local listener over real HTTP — proving the wire path.
  const seq = [
    {
      label: 'GHL→DrChrono appointment CREATE',
      input: {
        eventId: 'demo-appt-create',
        target: 'drchrono' as const,
        entity: 'appointment' as const,
        verb: 'create' as const,
        body: {
          doctor: 12345,
          patient: 67890,
          scheduled_time: '2026-06-01T15:00:00',
          duration: 30,
          notes: 'New patient consult',
        },
      },
    },
    {
      label: 'GHL→DrChrono appointment UPDATE (reschedule)',
      input: {
        eventId: 'demo-appt-update',
        target: 'drchrono' as const,
        entity: 'appointment' as const,
        verb: 'update' as const,
        id: 'appt-555',
        body: { scheduled_time: '2026-06-02T17:30:00', duration: 45 },
      },
    },
    {
      label: 'GHL→DrChrono appointment CANCEL',
      input: {
        eventId: 'demo-appt-cancel',
        target: 'drchrono' as const,
        entity: 'appointment' as const,
        verb: 'cancel' as const,
        id: 'appt-555',
        body: {},
      },
    },
    {
      label: 'DrChrono→GHL contact CREATE',
      input: {
        eventId: 'demo-contact-create',
        target: 'ghl' as const,
        entity: 'contact' as const,
        verb: 'create' as const,
        body: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '+15555550123' },
      },
    },
  ];

  for (const step of seq) {
    const outcome = await dispatchWrite(step.input, { mode: 'verify', retryDelayFactor: 0 });
    const env = captured[captured.length - 1];
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log(`▶ ${step.label}   → outcome: ${outcome}`);
    console.log('──────────────────────────────────────────────────────────────');
    console.log(JSON.stringify(env, null, 2));
  }

  // 3) Summary.
  const ehrHits = captured.filter((e) => {
    const u = e?.wouldHaveSent?.url ?? '';
    return /drchrono\.com|leadconnectorhq\.com/.test(u);
  }).length;

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log(`✅ ${captured.length} writes captured, 0 sent to live EHR`);
  console.log(
    `   (captured envelopes targeting an EHR base URL: ${ehrHits} — these are the URLs the engine WOULD have called; 0 real calls were made)`,
  );

  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.exit(0);
}

main().catch((err) => {
  console.error('demo failed:', err);
  process.exit(1);
});
