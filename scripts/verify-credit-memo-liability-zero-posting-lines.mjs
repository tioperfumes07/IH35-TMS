#!/usr/bin/env node
// TASK 18 OF 48 (ROUND E12.1-R2, owner order 2026-09-23) — the standing tripwire behind
// void-document.service.ts's credit_memo/liability cases (TASK 18): both are wired to return
// `reversalJournalEntryId: null` because they carry ZERO posting lines TODAY, verified live
// (bypass_rls, tiny-field-89581227) — but that is a currently-true fact, not a permanent guarantee.
// driver-finance/escrow-forfeit.service.ts can write a REAL posting with
// `source_transaction_type: "liability"` whenever a forfeiture names a `linked_liability_id` (never
// yet exercised live) — the exact live-capable path that would silently make voidDocument()'s
// `reversalJournalEntryId: null` a lie the instant it fires. There is no analogous live-capable
// writer found for 'credit_memo' (grep-confirmed, see void-document.service.ts's header), but this
// guard watches BOTH types, not just the one with a known writer — a future credit_memo poster is
// exactly the kind of new writer this tripwire exists to catch on day one.
//
// This is a ZERO-TOLERANCE tripwire, not a shrink-only ratchet: there is no baseline file and none
// is ever written. The FIRST live posting line at either source type is itself the signal that
// void-document.service.ts's credit_memo/liability cases (and this guard) need real reversal
// wiring, not debt to carry — "fails the build the first time either writes a posting."
//
// Fails closed with no DATABASE_URL (requireLiveDbOrExit, ROUND 29.9-B).
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-credit-memo-liability-zero-posting-lines";
export const REQUIRES_LIVE_DB =
  "live-data money guard (TASK 18 tripwire); fails closed via requireLiveDbOrExit with no DATABASE_URL";

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const res = await client.query(`
      SELECT source_transaction_type, count(*)::int AS n
        FROM accounting.journal_entry_postings
       WHERE source_transaction_type IN ('credit_memo', 'liability')
       GROUP BY source_transaction_type
    `);

    await client.query("COMMIT");

    if (res.rows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — a source type this codebase treats as zero-posting-line/subledger-only just posted for real:`);
      for (const r of res.rows) {
        console.error(
          `  ✗ source_transaction_type='${r.source_transaction_type}' — ${r.n} live journal_entry_postings row(s)`
        );
      }
      console.error(
        `  This is the trigger, not debt to baseline: apps/backend/src/accounting/void-document.service.ts's ` +
          `credit_memo/liability cases return reversalJournalEntryId: null unconditionally — that is now WRONG ` +
          `for whichever type(s) are listed above. Wire a real reversal for that type before this can pass again; ` +
          `never widen this guard to accept a nonzero count.`
      );
      process.exit(1);
    }

    console.log(
      `${LABEL}: LIVE PASS — 0 journal_entry_postings rows at source_transaction_type IN ('credit_memo','liability'); ` +
        `both remain genuinely subledger-only. exit 0`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
