#!/usr/bin/env node
// ROUND 138 (owner order, via Lead relay, P0) — companion guard to
// apps/backend/src/accounting/cascade-void-engine.service.ts. Same two-arm shape as
// verify-void-stamps-the-spec-liveness-column.mjs (ROUND 131.2), one level deeper: that guard
// checks a PARENT's own liveness column against the spec JSON; this one checks each parent's
// CHILDREN.
//
// STATIC ARM: for every CASCADE_CHILDREN entry with a non-null livenessColumn, confirms the JSON's
// live_predicate for that child table still says `<livenessColumn> IS NULL` -- catches the JSON
// drifting out from under the engine's literal config (the same defensive shape this whole session
// has used everywhere a per-table liveness column is declared, never read from the JSON at runtime).
//
// LIVE ARM: for each such child, counts live rows (childLivenessColumn IS NULL) whose PARENT is
// voided -- required value 0. "Parent voided" uses each family's own reliable, universally-written
// void signal (verified live, not guessed, before writing this guard):
//   invoice/bill/expense -> status = 'void' (written by every void-write call site found this round)
//   driver_settlement -> status = 'cancelled' (this table has no 'void' status value; 'cancelled' is
//     its own terminal void-equivalent, confirmed via its CHECK constraint)
// factoring_advance and company_settlement carry no children with a writable livenessColumn (every
// entry is `livenessColumn: null`, dead-by-inheritance per the JSON's own law) -- nothing for the
// live arm to check there, so they're absent from LIVE_CHECKS by design, not oversight.
//
// A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B) -- no
// ALLOW_OFFLINE_SKIP declared.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-void-cascades-to-every-child";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_FILE = path.join(ROOT, "apps/backend/src/accounting/cascade-void-engine.service.ts");
const SPEC_FILE = path.join(ROOT, "scripts/purge/usmca-purge-expected-zero.generated.json");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// FIXED, INDEPENDENT expectation -- this guard's own reading of cascade-void-engine.service.ts's
// CASCADE_CHILDREN at authoring time, re-verified against both the source file and the live JSON
// every run (same shape as verify-void-stamps-the-spec-liveness-column.mjs's EXPECTED).
const EXPECTED_WRITABLE_CHILDREN = [
  { schema: "accounting", table: "invoice_lines", fkColumn: "invoice_id", livenessColumn: "soft_deleted_at" },
  { schema: "accounting", table: "bill_lines", fkColumn: "bill_id", livenessColumn: "voided_at" },
  { schema: "driver_finance", table: "settlement_lines", fkColumn: "settlement_id", livenessColumn: "voided_at" },
  { schema: "driver_finance", table: "driver_settlement_deductions", fkColumn: "applied_to_settlement_id", livenessColumn: "voided_at" },
];

// SCOPED EXCLUSION (Lead ruling, docs/bus/09-28-2026-LEAD-RULING-BILL-LINE-2822f791-CC1-ADOPTION-DEBRIS.md):
// bill_lines row 2822f791-ff2e-43c5-9dfb-d8d0ba4f1e65 under voided bill d03de0c0-a54c-467a-8c04-
// 49f199a925a8 (BILL-2026-00004) is debris from CC-1's ROUND 154 A/P-adoption run, killed
// mid-flight while switching to the set-based approach -- the bill's own void_reason says so
// verbatim ("header+1 line only, zero payments, zero gl linkage, no money moved, safe to void and
// recreate cleanly"). Owned by CC-1, live adoption in flight -- not a CC-2/check-engine defect and
// not touched here (writing into accounting.bills/bill_lines while CC-1's transaction is mid-flight
// risks colliding with or double-voiding real money rows). A NAMED, EXPIRING exclusion, not a
// baseline regeneration: if this row is still unresolved after the expiry below, the guard goes red
// again and someone has to look at it fresh, not assume it is still just adoption debris.
const KNOWN_ORPHAN_EXCLUSIONS = {
  "accounting.bill_lines": [
    {
      id: "2822f791-ff2e-43c5-9dfb-d8d0ba4f1e65",
      owner: "CC-1",
      reason: "ROUND 154 A/P-adoption run killed mid-flight; bill d03de0c0-a54c-467a-8c04-49f199a925a8 (BILL-2026-00004) voided, its one line never cascaded",
      expires_at: "2026-10-05T00:00:00.000Z",
    },
  ],
};

function activeExclusionIds(childTable, now = new Date()) {
  const rows = KNOWN_ORPHAN_EXCLUSIONS[childTable] ?? [];
  return rows.filter((r) => now.getTime() < new Date(r.expires_at).getTime()).map((r) => r.id);
}

const LIVE_CHECKS = [
  {
    label: "invoice -> invoice_lines",
    childTable: "accounting.invoice_lines",
    fkColumn: "invoice_id",
    livenessColumn: "soft_deleted_at",
    parentTable: "accounting.invoices",
    parentVoidPredicate: "status = 'void'",
  },
  {
    label: "bill -> bill_lines",
    childTable: "accounting.bill_lines",
    fkColumn: "bill_id",
    livenessColumn: "voided_at",
    parentTable: "accounting.bills",
    parentVoidPredicate: "status = 'void'",
  },
  {
    label: "driver_settlement -> settlement_lines",
    childTable: "driver_finance.settlement_lines",
    fkColumn: "settlement_id",
    livenessColumn: "voided_at",
    parentTable: "driver_finance.driver_settlements",
    parentVoidPredicate: "status = 'cancelled'",
  },
  {
    label: "driver_settlement -> driver_settlement_deductions",
    childTable: "driver_finance.driver_settlement_deductions",
    fkColumn: "applied_to_settlement_id",
    livenessColumn: "voided_at",
    parentTable: "driver_finance.driver_settlements",
    parentVoidPredicate: "status = 'cancelled'",
  },
];

function staticCheck() {
  const src = fs.readFileSync(ENGINE_FILE, "utf8");
  const spec = JSON.parse(fs.readFileSync(SPEC_FILE, "utf8"));
  const specByTable = new Map(spec.must_be_zero_after_purge.map((r) => [r.table, r.live_predicate]));

  const mismatches = [];

  for (const exp of EXPECTED_WRITABLE_CHILDREN) {
    const qualified = `${exp.schema}.${exp.table}`;
    const re = new RegExp(
      `table:\\s*"${exp.table}",\\s*fkColumn:\\s*"${exp.fkColumn}",\\s*livenessColumn:\\s*"${exp.livenessColumn}"`
    );
    if (!re.test(src)) {
      mismatches.push(`${qualified}: could not find { table: "${exp.table}", fkColumn: "${exp.fkColumn}", livenessColumn: "${exp.livenessColumn}" } in ${ENGINE_FILE} (source drifted from this guard's expectation)`);
      continue;
    }

    const livePredicate = specByTable.get(qualified);
    const expectedPredicate = `${exp.livenessColumn} IS NULL`;
    if (!livePredicate || !livePredicate.includes(expectedPredicate)) {
      mismatches.push(`${qualified}: this guard expects live_predicate to include "${expectedPredicate}", but the JSON currently says ${JSON.stringify(livePredicate)}`);
    }
  }

  return mismatches;
}

async function liveCheck(client) {
  const violations = [];

  for (const check of LIVE_CHECKS) {
    const excludeIds = activeExclusionIds(check.childTable);
    const res = await client.query(
      `SELECT count(*)::text AS n
         FROM ${check.childTable} c
         JOIN ${check.parentTable} p ON p.id = c.${check.fkColumn}
        WHERE c.operating_company_id = $1::uuid
          AND p.operating_company_id = $1::uuid
          AND p.${check.parentVoidPredicate}
          AND c.${check.livenessColumn} IS NULL
          AND NOT (c.id = ANY($2::uuid[]))`,
      [USMCA, excludeIds]
    );
    const n = Number(res.rows[0].n);
    if (n > 0) {
      violations.push(`${check.label}: ${n} live child row(s) under a voided parent (${check.parentTable}.${check.parentVoidPredicate}, ${check.childTable}.${check.livenessColumn} IS NULL)`);
    }
    if (excludeIds.length > 0) {
      console.log(`${LABEL}: ${check.childTable} has ${excludeIds.length} active named exclusion(s) (see KNOWN_ORPHAN_EXCLUSIONS) -- not counted above, not a pass on those rows.`);
    }
  }

  return violations;
}

async function main() {
  const staticMismatches = staticCheck();

  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let liveViolations;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    liveViolations = await liveCheck(client);
    await client.query("ROLLBACK");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL —`, e);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }

  const total = staticMismatches.length + liveViolations.length;
  if (total > 0) {
    console.error(`${LABEL}: FAIL — ${total} mismatch(es):`);
    for (const m of staticMismatches) console.error(`  ✗ STATIC: ${m}`);
    for (const v of liveViolations) console.error(`  ✗ LIVE: ${v}`);
    process.exit(1);
  }

  console.log(`${LABEL}: OK — static arm (CASCADE_CHILDREN vs the spec JSON) and live arm (0 live children under a voided parent, across ${LIVE_CHECKS.length} registered writable child tables) both clean.`);
  process.exit(0);
}

main();
