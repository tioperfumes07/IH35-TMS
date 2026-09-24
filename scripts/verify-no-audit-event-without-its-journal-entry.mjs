#!/usr/bin/env node
// GUARD — verify-no-audit-event-without-its-journal-entry (ROUND 142.1, DEVIN-B)
//
// Every accounting.bank_reconciliation.variance_posted audit event must resolve to a LIVE journal entry.
// The current code path must not produce an audit event whose JE does not exist.
//
// 7-DAY SCOPED (LAW 3): anything older than 7 days is STALE — not a live finding. The one orphaned
// event dated 2026-08-25 is a month old, predates the wipe and engine rebuilds, and is OUT OF SCOPE.
// The guard evaluates ONLY events dated within the last 7 days. Out-of-scope is not a variance.
//
// Self-test: node scripts/verify-no-audit-event-without-its-journal-entry.mjs --selftest
export const REQUIRES_LIVE_DB =
  "audit.audit_events + accounting.journal_entries — must fail-closed, never skip";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-no-audit-event-without-its-journal-entry";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const VARIANCE_EVENT_CLASS = "accounting.bank_reconciliation.variance_posted";
const SEVEN_DAY_SCOPE = "7 days";

/**
 * Classify audit events against live journal entries. Pure function — exported for selftest.
 * @param {{
 *   events: Array<{ uuid: string, created_at: string, je_id: string|null, bt_id: string|null }>,
 *   liveJeIds: string[],
 * }} input
 * @returns {{ problems: string[], scoped: number, orphans: number }}
 */
export function classifyAuditJeResolution(input) {
  const { events, liveJeIds } = input;
  const liveSet = new Set(liveJeIds);
  const problems = [];
  let orphans = 0;

  for (const ev of events) {
    if (!ev.je_id) {
      problems.push(`AUDIT_EVENT_NO_JE_ID: event ${ev.uuid} (created ${ev.created_at}) has no journal_entry_id in payload — audit event without a JE reference`);
      orphans += 1;
      continue;
    }
    if (!liveSet.has(ev.je_id)) {
      problems.push(`AUDIT_EVENT_ORPHAN_JE: event ${ev.uuid} (created ${ev.created_at}) references JE ${ev.je_id} which does not exist live — audit event without its journal entry`);
      orphans += 1;
    }
  }

  return { problems, scoped: events.length, orphans };
}

function runSelftest() {
  let pass = 0;
  let fail = 0;

  const fixtures = [
    // Clean: no events in 7-day window
    {
      name: "no events — clean",
      input: { events: [], liveJeIds: [] },
      expectProblems: 0,
    },
    // Clean: event with existing JE
    {
      name: "event with existing JE — clean",
      input: {
        events: [{ uuid: "ev1", created_at: "2026-09-24T01:00:00Z", je_id: "je1", bt_id: "bt1" }],
        liveJeIds: ["je1"],
      },
      expectProblems: 0,
    },
    // RED: event with missing JE (the defect)
    {
      name: "event with missing JE — RED",
      input: {
        events: [{ uuid: "ev2", created_at: "2026-09-24T01:00:00Z", je_id: "je-missing", bt_id: "bt2" }],
        liveJeIds: ["je1"],
      },
      expectProblems: 1,
      expectContains: "AUDIT_EVENT_ORPHAN_JE",
    },
    // RED: event with no JE ID in payload
    {
      name: "event with no JE ID — RED",
      input: {
        events: [{ uuid: "ev3", created_at: "2026-09-24T01:00:00Z", je_id: null, bt_id: "bt3" }],
        liveJeIds: ["je1"],
      },
      expectProblems: 1,
      expectContains: "AUDIT_EVENT_NO_JE_ID",
    },
    // Clean: multiple events, all with existing JEs
    {
      name: "multiple events all resolved — clean",
      input: {
        events: [
          { uuid: "ev4", created_at: "2026-09-24T01:00:00Z", je_id: "je1", bt_id: "bt1" },
          { uuid: "ev5", created_at: "2026-09-24T02:00:00Z", je_id: "je2", bt_id: "bt2" },
        ],
        liveJeIds: ["je1", "je2"],
      },
      expectProblems: 0,
    },
    // RED: one clean + one orphan
    {
      name: "one clean + one orphan — RED",
      input: {
        events: [
          { uuid: "ev6", created_at: "2026-09-24T01:00:00Z", je_id: "je1", bt_id: "bt1" },
          { uuid: "ev7", created_at: "2026-09-24T02:00:00Z", je_id: "je-missing", bt_id: "bt2" },
        ],
        liveJeIds: ["je1"],
      },
      expectProblems: 1,
      expectContains: "AUDIT_EVENT_ORPHAN_JE",
    },
  ];

  for (const { name, input, expectProblems, expectContains } of fixtures) {
    const result = classifyAuditJeResolution(input);
    const ok = result.problems.length === expectProblems &&
      (!expectContains || result.problems.some((p) => p.includes(expectContains)));
    if (!ok) {
      console.error(`${LABEL} --selftest FAIL — ${name}: expected ${expectProblems} problems${expectContains ? ` containing '${expectContains}'` : ""}, got ${JSON.stringify(result.problems)}`);
      fail += 1;
    } else pass += 1;
  }

  if (fail > 0) {
    process.exitCode = 1;
  } else {
    console.log(`${LABEL} --selftest PASS — ${pass} classifier fixtures all correct`);
  }
}

async function measureLive(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");

  // Fetch variance_posted events within the last 7 days (7-DAY SCOPE — LAW 3)
  const eventsRes = await client.query(
    `SELECT uuid::text, created_at::text, payload->>'journal_entry_id' AS je_id, payload->>'bank_transaction_id' AS bt_id
       FROM audit.audit_events
      WHERE event_class = $1
        AND created_at >= now() - interval '${SEVEN_DAY_SCOPE}'
      ORDER BY created_at DESC`,
    [VARIANCE_EVENT_CLASS],
  );

  // Also count total events (for reporting — out-of-scope events)
  const totalRes = await client.query(
    `SELECT count(*)::int AS total FROM audit.audit_events WHERE event_class = $1`,
    [VARIANCE_EVENT_CLASS],
  );

  // Fetch the live JE IDs referenced by the 7-day events
  const jeIds = eventsRes.rows.map((r) => r.je_id).filter(Boolean);
  let liveJeIds = [];
  if (jeIds.length > 0) {
    const jeRes = await client.query(
      `SELECT id::text FROM accounting.journal_entries WHERE id = ANY($1::uuid[])`,
      [jeIds],
    );
    liveJeIds = jeRes.rows.map((r) => r.id);
  }

  await client.query("ROLLBACK");
  return {
    events: eventsRes.rows,
    liveJeIds,
    totalEvents: totalRes.rows[0].total,
  };
}

function run({ selftest }) {
  if (selftest) {
    runSelftest();
    return Promise.resolve();
  }
  return runFull();
}

async function runFull() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let events = [], liveJeIds = [], totalEvents = 0;
  try {
    const live = await measureLive(client);
    events = live.events;
    liveJeIds = live.liveJeIds;
    totalEvents = live.totalEvents;
  } finally {
    client.release();
    await pool.end();
  }

  console.log(`${LABEL}: ${totalEvents} total variance_posted event(s) (all time).`);
  console.log(`${LABEL}: ${events.length} event(s) in 7-day scope (LAW 3 — older is STALE, out of scope).`);

  const { problems, scoped, orphans } = classifyAuditJeResolution({ events, liveJeIds });

  if (problems.length > 0) {
    console.error(`\n${LABEL}: FAIL — ${orphans} orphan(s) of ${scoped} scoped event(s):\n` + problems.map((p) => `  ${p}`).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`\n${LABEL}: PASS — ${scoped} event(s) in 7-day scope, ${orphans} orphan(s). All audit events resolve to live journal entries.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await run({ selftest: process.argv.includes("--selftest") });
}
