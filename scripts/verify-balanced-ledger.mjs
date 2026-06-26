#!/usr/bin/env node
/**
 * verify-balanced-ledger.mjs  —  BLOCK-RELIABILITY-01  (SKELETON / pre-draft)
 *
 * Standing trial-balance integrity audit over accounting.journal_entry_postings — the QBO/NetSuite-grade
 * "the books always balance" re-check. The double-entry invariant is enforced at WRITE time (triggers /
 * migration 0092_p5_d4_manual_journal_entries.sql). This is the ADDITIVE standing audit that re-checks the
 * whole ledger after the fact, so a bad migration / manual JE / partial reversal can't silently break it
 * once BILL_GL_POSTING_ENABLED flips on and real volume flows.
 *
 * GROUNDED (live schema, 2026-06-25):
 *   accounting.journal_entry_postings: journal_entry_uuid -> accounting.journal_entries(id) (FK, ON DELETE
 *   CASCADE), line_sequence int CHECK>0, debit_or_credit text CHECK IN ('debit','credit'),
 *   amount_cents bigint CHECK>0, operating_company_id uuid NOT NULL, reversal_of_line_id, reversed_by_line_id.
 *
 * ASSERTIONS (entity-scoped — a JE must balance WITHIN its operating_company_id; never net across entities):
 *   A. balance      — per journal_entry_uuid, SUM(debit amount_cents) = SUM(credit amount_cents).
 *   B. min-2-lines  — per journal_entry_uuid, >= 2 posting lines.
 *   E. reversal-link — reversal_of_line_id / reversed_by_line_id (if set) point to an existing line.
 *   (D amount>0 and C no-orphan are ALREADY DB-enforced — CHECK + FK — so this script does NOT re-assert
 *    them; noted to avoid redundant work. debit_or_credit is strictly 'debit'/'credit' — no dr/cr variants.)
 *
 * SINGLE SOURCE: the SQL lives in ASSERTIONS below so the daily cron (BLOCK-RELIABILITY-01 part 2) imports
 * the SAME queries — do NOT duplicate the SQL in the cron.
 *
 * MODE: ADVISORY by default (lists violations, exit 0). MIGRATION/LEDGER enforce flag
 * BALANCED_LEDGER_ENFORCE=true → blocking (exit 1) once clean. Read-only; never repairs a JE (drift is
 * fixed by a human via a NEW manual JE per blueprint 10a.1.5.16 — this only DETECTS).
 *
 * DEGRADE-SAFE: if no DB is reachable (no DATABASE_URL), SKIP with a warning and exit 0 — never crash.
 * (This is the exact graceful-degradation the block-ready C5 hook lacks; applied here on purpose.)
 */

import process from "node:process";

const ENFORCE = process.env.BALANCED_LEDGER_ENFORCE === "true";

/** Single-source assertion SQL (imported by both this guard and the daily cron). */
export const ASSERTIONS = {
  // A — unbalanced JEs (debit total != credit total) per entity.
  balance: `
    SELECT journal_entry_uuid, operating_company_id,
           SUM(CASE WHEN debit_or_credit='debit'  THEN amount_cents ELSE 0 END) AS debit_cents,
           SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END) AS credit_cents
      FROM accounting.journal_entry_postings
     GROUP BY journal_entry_uuid, operating_company_id
    HAVING SUM(CASE WHEN debit_or_credit='debit'  THEN amount_cents ELSE 0 END)
        <> SUM(CASE WHEN debit_or_credit='credit' THEN amount_cents ELSE 0 END)`,
  // B — JEs with fewer than 2 lines.
  minLines: `
    SELECT journal_entry_uuid, operating_company_id, COUNT(*) AS line_count
      FROM accounting.journal_entry_postings
     GROUP BY journal_entry_uuid, operating_company_id
    HAVING COUNT(*) < 2`,
  // E — dangling reversal links (reversal_of_line_id / reversed_by_line_id pointing nowhere).
  reversalIntegrity: `
    SELECT p.id, p.journal_entry_uuid, p.reversal_of_line_id, p.reversed_by_line_id
      FROM accounting.journal_entry_postings p
     WHERE (p.reversal_of_line_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings x WHERE x.id = p.reversal_of_line_id))
        OR (p.reversed_by_line_id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM accounting.journal_entry_postings x WHERE x.id = p.reversed_by_line_id))`,
};

async function main() {
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    // DEGRADE-SAFE: no DB locally → skip, do not crash (unlike the block-ready C5 hook).
    console.warn("[balanced-ledger] no DATABASE_URL — skipping (advisory). CI/cron with a DB is the real gate.");
    process.exit(0);
  }

  // pg is a runtime dep; import lazily so the no-DB path above never needs it.
  const pg = (await import("pg")).default;
  const pool = new pg.Pool({ connectionString: cs, max: 2 });

  try {
    const violations = {};
    for (const [name, sql] of Object.entries(ASSERTIONS)) {
      const r = await pool.query(sql);
      if (r.rows.length) violations[name] = r.rows;
    }

    const total = Object.values(violations).reduce((n, rows) => n + rows.length, 0);
    if (total === 0) {
      console.log("[balanced-ledger] PASS — all JEs balanced, >=2 lines, reversal links intact (entity-scoped).");
      process.exit(0);
    }

    const header = ENFORCE ? "BALANCED-LEDGER GUARD FAILED" : "BALANCED-LEDGER — ADVISORY (not blocking)";
    console.error(`\n${header}`);
    console.error("=".repeat(64));
    for (const [name, rows] of Object.entries(violations)) {
      console.error(`  [${name}] ${rows.length} violation(s):`);
      for (const row of rows.slice(0, 25)) console.error(`     ${JSON.stringify(row)}`);
      if (rows.length > 25) console.error(`     … +${rows.length - 25} more`);
    }
    console.error("=".repeat(64));
    console.error("Drift is fixed by a NEW manual JE (human) — this guard DETECTS only, never repairs.");
    // TODO(part 2): cron writes a finding + fans an alarm to email+screen+SMS per 00b on any violation.

    process.exit(ENFORCE ? 1 : 0);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  // Never crash the build on an infra hiccup — surface + advisory-exit (enforce path still fails).
  console.error("[balanced-ledger] error:", e?.message ?? e);
  process.exit(ENFORCE ? 1 : 0);
});
