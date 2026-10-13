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
import fs from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-credit-memo-liability-zero-posting-lines";
export const REQUIRES_LIVE_DB =
  "live-data money guard (TASK 18 tripwire); fails closed via requireLiveDbOrExit with no DATABASE_URL";

// 443.100 — ROUND 373.4 (202615370000, CC-1) made a credit memo that names its account POST at creation, and this
// tripwire fired in CI exactly as designed. The answer it demands ("wire a real reversal for that type before this can
// pass again") is now in place: void-document.service.ts's credit_memo case reverses the posting through the engine,
// like credit-memos.routes.ts's /void. So a type counts as WIRED only while its void case provably reverses through
// reversePostedSourceTransactionInClientTx for that source type (static, comments stripped); a wired type's postings
// are expected, and every VOIDED document of that type must carry its reversal (live). Any type NOT wired stays
// zero-tolerance — 'liability' today, and 'credit_memo' again the moment its reversal is removed.
const VOID_DOOR = "apps/backend/src/accounting/void-document.service.ts";
const TYPES = ["credit_memo", "liability"];

/** Static: the void door's case for `type` reverses through the engine (its own `case "<type>": {` block). */
export function voidCaseReverses(source, type) {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const m = code.match(new RegExp(`case "${type}":\\s*\\{([\\s\\S]*?)\\n    \\}\\n`));
  if (!m) return false;
  return /reversePostedSourceTransactionInClientTx\(/.test(m[1]) && new RegExp(`source_transaction_type:\\s*"${type}"`).test(m[1]);
}

/** Verdict: postings at an UNWIRED type fail (zero tolerance); a wired type fails on any voided doc left unreversed. */
export function verdict(rows, wired = new Set(), unreversedVoided = []) {
  const unwired = rows.filter((r) => !wired.has(r.source_transaction_type));
  const ok = unwired.length === 0 && unreversedVoided.length === 0;
  return ok ? { ok: true, rows: [], unreversedVoided: [] } : { ok: false, rows: unwired, unreversedVoided };
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(VOID_DOOR, "utf8");
  const W = new Set(["credit_memo"]);
  const cases = [
    ["no credit_memo / liability postings passes", verdict([]).ok === true],
    ["one liability posting fails", verdict([{ source_transaction_type: "liability", n: 1 }], W).ok === false],
    ["one credit_memo posting fails while credit_memo is NOT wired", verdict([{ source_transaction_type: "credit_memo", n: 3 }]).ok === false],
    ["credit_memo postings pass once wired", verdict([{ source_transaction_type: "credit_memo", n: 3 }], W).ok === true],
    ["a voided credit memo left unreversed fails even when wired", verdict([{ source_transaction_type: "credit_memo", n: 3 }], W, [{ id: "cm-1" }]).ok === false],
    ["real void door: credit_memo case reverses through the engine", voidCaseReverses(real, "credit_memo") === true],
    ["real void door: liability case does not (stays zero-tolerance)", voidCaseReverses(real, "liability") === false],
    ["credit_memo reversal removed -> not wired", voidCaseReverses(real.replace(/source_transaction_type: "credit_memo"/g, 'source_transaction_type: "x"'), "credit_memo") === false],
    ["reversal named only in a comment -> not wired", voidCaseReverses('    case "credit_memo": {\n      // reversePostedSourceTransactionInClientTx( source_transaction_type: "credit_memo"\n      return null;\n    }\n', "credit_memo") === false],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? "verify-credit-memo-liability-zero-posting-lines --selftest FAIL" : `verify-credit-memo-liability-zero-posting-lines --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

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

    const voidDoor = fs.readFileSync(VOID_DOOR, "utf8");
    const wired = new Set(TYPES.filter((t) => voidCaseReverses(voidDoor, t)));
    // A voided credit memo whose posted (original) lines carry no reversing line — the void left A/R reduced.
    const unreversed = wired.has("credit_memo")
      ? (await client.query(`
          SELECT cm.id::text AS id, cm.display_id
            FROM accounting.credit_memos cm
           WHERE cm.voided_at IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM accounting.journal_entry_postings p
                WHERE p.operating_company_id = cm.operating_company_id
                  AND p.source_transaction_type = 'credit_memo' AND p.source_transaction_id::text = cm.id::text
                  AND p.reversal_of_line_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings r
                                   WHERE r.operating_company_id = p.operating_company_id AND r.reversal_of_line_id = p.id))
        `)).rows
      : [];

    await client.query("COMMIT");

    const v = verdict(res.rows, wired, unreversed);
    for (const id of unreversed) console.error(`  ✗ voided credit memo ${id.display_id ?? id.id} still carries an unreversed posting — the void left A/R reduced.`);
    if (!v.ok && v.rows.length === 0) {
      console.error(`${LABEL}: LIVE FAIL — ${unreversed.length} voided credit memo(s) carry an unreversed posting.`);
      process.exit(1);
    }
    res.rows = v.rows;
    if (!v.ok) {
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
      `${LABEL}: LIVE PASS — unwired type(s) [${TYPES.filter((t) => !wired.has(t)).join(", ") || "none"}] carry 0 posting lines; ` +
        `wired type(s) [${[...wired].join(", ") || "none"}] reverse through the void door, 0 voided left unreversed. exit 0`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
