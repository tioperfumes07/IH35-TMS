#!/usr/bin/env node
// GUARD — verify-bank-line-status-has-live-target (E8, P1, Round 53 ruling)
//
// DEFECT (owner-named): a bank line can read status='categorized' with coa_account_id set and
// matched_journal_entry_id pointing at a journal entry — and still have NOTHING LIVE BEHIND IT if
// that journal entry was later reversed. `banking.bank_transactions.status` never gets flipped back
// when its matched JE dies, so the register reads "reconciled" while the GL has already unwound the
// entry. Measured live 2026-09-22: 76 of 77 categorized bank lines with a matched_journal_entry_id
// point at a reversed JE. All 76 share the same shape: real JE, real posting, `reversed_by_je_id`
// set — a correct reversal, an incorrect status.
//
// THE FIVE-COLUMN LIVENESS PREDICATE (owner, verbatim: "all five, every time"). Two false alarms
// this session came from testing fewer than five (e.g. the sibling guard
// verify-no-voided-doc-has-live-postings.mjs tests only four — it has no reverses_je_id check, so it
// would treat a JE that ITSELF reverses another as live, which is technically true for a *reversal*
// JE but is the wrong question here: a bank line matched to a JE that is a pure reversal, with no
// live posting of its own kind, is not "reconciled" either). All five, every time:
//   je.status = 'posted'
//   AND je.voided_at IS NULL
//   AND je.reversed_by_je_id IS NULL      -- this JE has not itself been reversed
//   AND je.reverses_je_id IS NULL         -- this JE is not itself a pure reversal entry
//   AND p.reversed_by_line_id IS NULL     -- the specific posting line has not been reversed
//
// SCOPE: banking.bank_transactions in status='categorized' (or any other matched/reconciled state)
// with matched_journal_entry_id set. A row with matched_journal_entry_id NULL is a different, older,
// already-covered gap (the post-categorized-backlog recovery route). This guard is specifically the
// "status lies" case: a pointer exists, but nothing live sits behind it.
//
// SHRINK-ONLY BASELINE RATCHET — same shape as verify-no-voided-doc-has-live-postings.mjs /
// verify-alwaystrack-parity.mjs: not-in-baseline growth fails; baseline-entry growth fails; baseline
// reaching zero without removing the baseline fails ("remove me"); unchanged or shrunk known debt
// passes, printed every run, never silent. NOT wired into the blocking verify-step chain this round
// (Round 53: voids/categorizations are on HOLD — wiring this as a hard gate would freeze every
// seat's push against a population nobody is authorized to fix yet). Listed in
// scripts/.guard-exempt.json with that reason.
//
// RED-BEFORE-GREEN, live (no baseline file existed to fake this): first run with no baseline
// correctly FAILED against the real 76-row live defect (`LIVE FAIL — no baseline file and 76 bank
// line(s)...`). Baseline seeded at that exact measurement -> re-run correctly PASSED as known,
// reconciled debt. Baseline then perturbed to 75 (simulating a future regression, without touching
// any accounting table) -> re-run correctly FAILED again (`Debt GREW`) -> restored to 76 -> PASSED.
// No direct INSERT into an accounting table anywhere in this proof — the "planted dead match" is the
// real, live, already-reversed population itself; the ratchet-growth case is proven by perturbing the
// comparison baseline, not the data.
export const REQUIRES_LIVE_DB =
  "money-relevant (bank reconciliation status integrity) — must fail-closed, never skip, per ROUND 29.9-B";

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LABEL = "verify-bank-line-status-has-live-target";
const BASELINE_PATH = path.join(process.cwd(), "scripts/verify-bank-line-status-has-live-target.baseline.json");

const LIVENESS_SQL = `
  je.status = 'posted'
  AND je.voided_at IS NULL
  AND je.reversed_by_je_id IS NULL
  AND je.reverses_je_id IS NULL
  AND EXISTS (
    SELECT 1 FROM accounting.journal_entry_postings p
     WHERE p.journal_entry_uuid = je.id
       AND p.reversed_by_line_id IS NULL
  )
`;

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

async function measureLive(client) {
  const res = await client.query(`
    SELECT bt.operating_company_id::text AS company_id, count(*)::int AS n
      FROM banking.bank_transactions bt
      JOIN accounting.journal_entries je ON je.id = bt.matched_journal_entry_id
     WHERE bt.status IN ('categorized', 'matched')
       AND bt.matched_journal_entry_id IS NOT NULL
       AND bt.voided_at IS NULL
       AND NOT (${LIVENESS_SQL})
     GROUP BY bt.operating_company_id
  `);
  const perCompany = Object.fromEntries(res.rows.map((r) => [r.company_id, r.n]));
  const total = res.rows.reduce((acc, r) => acc + r.n, 0);
  return { perCompany, total };
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: FAIL — no DATABASE_URL. A money guard that cannot connect is a fail, not a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
  } catch (err) {
    console.error(`${LABEL}: FAIL — cannot connect (${err.code || err.message}). A money guard that cannot connect is a fail, not a pass (ROUND 29.9-B).`);
    process.exitCode = 1;
    return;
  }
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', false)");
    const measured = await measureLive(client);
    await client.query("ROLLBACK");

    console.log(
      `${LABEL}: measured live — ${measured.total} bank line(s) with status='categorized'/'matched' and ` +
        `a matched_journal_entry_id that fails the five-column liveness check. By company: ` +
        `${Object.entries(measured.perCompany).map(([id, n]) => `${id}=${n}`).join(", ") || "(none)"}`
    );

    const baseline = loadBaseline();
    let failures = 0;
    if (!baseline) {
      if (measured.total > 0) {
        console.error(`${LABEL}: LIVE FAIL — no baseline file and ${measured.total} bank line(s) with a dead matched target. A reconciled baseline must exist before this guard can pass on a nonzero total.`);
        failures++;
      }
    } else if (measured.total === 0) {
      console.error(`${LABEL}: LIVE FAIL — now CLEAN (0 lines), but a baseline for ${baseline.total} line(s) still exists — remove ${path.basename(BASELINE_PATH)} (good news; confirm it, don't leave stale debt on the books).`);
      failures++;
    } else if (measured.total !== baseline.total) {
      const worse = measured.total > baseline.total;
      console.error(
        `${LABEL}: LIVE FAIL — diverges from the reconciled baseline (${baseline.total} line(s), established ${baseline.established}). ` +
          `${worse ? "Debt GREW" : "Debt shrank but wasn't re-baselined"} — a human re-reconciles ` +
          `(the fix is a status re-set — never a re-post — for each dead-matched row) and regenerates the baseline with a cited reason before this can pass again.`
      );
      failures++;
    } else {
      console.log(
        `${LABEL}: known, reconciled debt — ${measured.total} bank line(s) (baseline established ${baseline.established}). ` +
          `Round 53 HOLD: voids/categorization fixes are paused; this population is tracked, not silently ignored.`
      );
    }

    if (failures > 0) process.exit(1);
    console.log(`${LABEL}: LIVE PASS.`);
  } finally {
    await client.end().catch(() => {});
  }
}

await live();
