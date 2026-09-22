#!/usr/bin/env node
// GUARD — verify-relay-deposits-land-in-usmca (ACCT-F30223, ROUND 31.1, owner-named)
//
// Owner, verbatim: "relay syncs in transportation, it should sync here now. it should be done
// daily. everything should be pulled live that is the point of relay."
//
// WHAT THIS GUARD IS, AND WHAT IT IS NOT. `integrations.relay_deposits` is populated ONLY by a
// one-shot manual CSV import (`scripts/run-relay-csv-import-once.mts`, hardcoded to one company) —
// there is no live Relay API for deposits at all (confirmed: relay-client.ts exports exactly one
// fetch function, fuel-transactions only; docs/specs/ASK-MIKE-RELAY-DEPOSITS-API-2026-07-16.md is
// an open, unanswered question to Relay asking whether a deposits endpoint even exists). This guard
// does NOT build or fake that live sync — it is the owner's own named acceptance test: it stays RED
// for as long as USMCA has a CSV import gap other companies don't, so the gap can never quietly
// disappear from view while it's real, and it goes GREEN the moment someone runs the (existing,
// unmodified) import script against a real USMCA export — no code change required to flip it.
//
// A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner ruling) — this
// touches money-relevant data, so it cannot declare ALLOW_OFFLINE_SKIP. Uses requireLiveDbOrExit,
// and declares REQUIRES_LIVE_DB so verify-static.mjs's no-DB sweep excludes it entirely rather than
// asking it a question it cannot answer; it still runs for real under money-pr-local-gate.mjs.
export const REQUIRES_LIVE_DB = "money-relevant (Relay wallet funding) — must fail-closed, never skip, per ROUND 29.9-B";

import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-relay-deposits-land-in-usmca";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function measure(client) {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
  const res = await client.query(
    `SELECT operating_company_id::text AS company_id, count(*)::int AS n
       FROM integrations.relay_deposits
      GROUP BY 1`
  );
  await client.query("ROLLBACK");
  const byCompany = new Map(res.rows.map((r) => [r.company_id, r.n]));
  const usmcaN = byCompany.get(USMCA_COMPANY_ID) ?? 0;
  const otherWithRows = [...byCompany.entries()].filter(([id, n]) => id !== USMCA_COMPANY_ID && n > 0);
  return { usmcaN, otherWithRows };
}

async function run({ selftest }) {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    const { usmcaN, otherWithRows } = await measure(client);
    const isRed = usmcaN === 0 && otherWithRows.length > 0;

    if (selftest) {
      // The owner's own instruction: this guard must be PROVEN to catch today's real gap before it
      // is trusted to catch a future regression of it. If it does NOT currently read RED against
      // live prod, either the gap has genuinely closed (re-baseline this selftest) or the guard is
      // broken — either way, do not let a silently-passing selftest stand in for the real check.
      if (!isRed) {
        console.error(
          `${LABEL} --selftest FAIL — expected RED against today's known state (USMCA=0 while another ` +
            `company has rows), but measured usmca=${usmcaN}, other-companies-with-rows=${otherWithRows.length}. ` +
            `If the gap has genuinely closed, that's real progress — re-baseline this selftest rather than ` +
            `trusting a selftest that no longer proves the guard fires.`
        );
        process.exitCode = 1;
        return;
      }
      console.log(
        `${LABEL} --selftest PASS — confirmed RED against live prod (usmca=${usmcaN}, ` +
          `${otherWithRows.length} other compan${otherWithRows.length === 1 ? "y" : "ies"} with rows: ` +
          `${otherWithRows.map(([id, n]) => `${id}=${n}`).join(", ")}). The guard fires correctly.`
      );
      return;
    }

    if (isRed) {
      console.error(
        `${LABEL}: LIVE FAIL — integrations.relay_deposits has 0 rows for USMCA while ` +
          `${otherWithRows.length} other compan${otherWithRows.length === 1 ? "y" : "ies"} carr${otherWithRows.length === 1 ? "ies" : "y"} rows: ` +
          `${otherWithRows.map(([id, n]) => `${id}=${n}`).join(", ")}. Known, named, owner-acknowledged gap — ` +
          `see docs/bus/OUTBOX-CC-2.md ROUND 31.1 (blocked on a human-exported Relay CSV for USMCA, not a code defect).`
      );
      process.exitCode = 1;
      return;
    }
    console.log(`${LABEL}: LIVE PASS — USMCA carries ${usmcaN} relay_deposits row(s).`);
  } finally {
    client.release();
    await pool.end();
  }
}

await run({ selftest: process.argv.includes("--selftest") });
