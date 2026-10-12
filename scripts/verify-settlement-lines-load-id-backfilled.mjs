#!/usr/bin/env node
// SETTLEMENT-LINES-REIMBURSEMENT-DEDUCTION-MISSING-LOAD-ID (item 6 of
// ~/Downloads/09-08-2026-CC1-SETTLEMENTS-6-ROOT-CAUSES-FOUND.md, closed 2026-09-09): 152 active
// reimbursement/deduction driver_finance.settlement_lines rows had load_id=NULL despite their own
// `description` text literally naming the load ("... load 13517 ..."), from an old one-time
// historical-backfill pass that predates the current code (which already correctly writes load_id on
// every new line). This made the on-screen Reimbursements/Deductions tables on the driver settlement
// detail page show a blank "Load #" column and (compounding it) a raw row-id in "Number" for every
// affected row -- looked broken even though the audit trail was intact in `description` all along.
// Backfilled live: parsed `load (\d+)` out of description, resolved to mdata.loads by
// (load_number, operating_company_id), and only wrote load_id where the resolution was unambiguous
// (exactly one real load) -- 152/152 resolved cleanly, 0 skipped for ambiguity, 1 known test-fixture
// row correctly left alone (no "load N" pattern to begin with). No dollar amount, GL posting, or
// source_type/category touched -- purely a missing-link backfill using data already on the row.
//
// This guard is a LIVE-DATA assertion, not a static code guard (there is no code defect to pin -- the
// current write path is already correct; the gap was purely historical). It exists to catch any NEW
// batch of settlement_lines that mentions a load in its own description text but never got the real
// load_id link -- e.g. a future one-off backfill/import repeating the same historical mistake.
//
// Usage: DATABASE_URL=<prod> node scripts/verify-settlement-lines-load-id-backfilled.mjs
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createRequire } from "node:module";
// 443.99: TLS only off loopback — a hard-coded ssl option fails "The server does not support SSL connections" on CI's postgres service.
const { buildPgPoolConfig } = createRequire(import.meta.url)("./lib/pg-connection-options.cjs");
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B) and runs in money-pr-local-gate.mjs when its owned paths change (Lead ROUND 84, E7 batch 2)";

const LABEL = "verify-settlement-lines-load-id-backfilled";

/** The row predicate of the live query, pure (same as its WHERE): an active reimbursement / deduction line with no
 *  load_id whose own description names a load. */
export function namesLoadWithoutLink(row) {
  return row.load_id == null && ["reimbursement", "deduction"].includes(row.line_type) && row.is_active === true
    && /load \d+/.test(String(row.description ?? ""));
}

/** The rule, pure: the failure message for the offending rows, or null when there are none. */
export function unlinkedLoadLinesFailure(rows) {
  if (!rows.length) return null;
  const sample = rows.slice(0, 5).map((r) => `${r.id}: ${r.description.slice(0, 80)}`).join("\n  ");
  return (
    `${rows.length} settlement_lines row(s) name a load in their own description but have no ` +
    `load_id link -- backfill them (parse "load (\\d+)", resolve against mdata.loads by ` +
    `(load_number, operating_company_id), write only when the resolution is unambiguous). Sample:\n  ${sample}`
  );
}

function selftest() {
  const line = (o) => ({ id: "l1", load_id: null, line_type: "reimbursement", is_active: true, description: "Lumper load 13517", ...o });
  const pick = (rows) => rows.filter(namesLoadWithoutLink);
  const cases = [
    ["a linked line passes", unlinkedLoadLinesFailure(pick([line({ load_id: "x" })])) === null],
    ["a line naming no load passes", unlinkedLoadLinesFailure(pick([line({ description: "Lumper fee" })])) === null],
    ["an inactive or non-reimbursement line is out of scope", unlinkedLoadLinesFailure(pick([line({ is_active: false }), line({ line_type: "earning" })])) === null],
    ["a reimbursement naming load 13517 with no load_id fails", unlinkedLoadLinesFailure(pick([line({})]))?.startsWith("1 settlement_lines row(s)") === true],
    ["a deduction naming a load fails too", unlinkedLoadLinesFailure(pick([line({ line_type: "deduction", description: "Advance load 13600" })])) !== null],
  ];
  for (const [n, p] of cases) console.log(`  ${p ? "✓" : "✗"} ${n}`);
  const bad = cases.filter(([, p]) => !p).length;
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

async function main() {
  const url = process.env.DATABASE_URL;
  // GATE-LIVELOCK-01 / dead-port-forbidden (verify-static.mjs's own rule): the DB-less static
  // sweep deliberately runs with DATABASE_URL unset, never a dead-port sentinel -- an unscoped
  // verify-*.mjs that throws instead of skipping on absence hard-blocks EVERY branch's local
  // push, not just settlement-lines work (found 2026-09-09 blocking an unrelated docs push).
  // Same skip convention as verify-driver-status-lock-blocks-reactivation.mjs's liveCheck(): log
  // and exit 0 when there is no DB to check against; run for real (and fail loudly) whenever a
  // caller deliberately sets DATABASE_URL, exactly as this file's own "Usage" comment intends.
  if (!url) {
    console.error("verify-settlement-lines-load-id-backfilled: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }
  const pool = new pg.Pool(buildPgPoolConfig(url));
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const res = await client.query(
      `SELECT id, description FROM driver_finance.settlement_lines
        WHERE load_id IS NULL AND line_type IN ('reimbursement','deduction') AND is_active = true
          AND description ~ 'load \\d+'`
    );
    const failure = unlinkedLoadLinesFailure(res.rows);
    if (failure) throw new Error(failure);
    console.log(`${LABEL} PASS -- every reimbursement/deduction settlement_lines row that names a load in its description has a real load_id link`);
  } finally {
    client.release();
    await pool.end();
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    main().catch((e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
  }
}
