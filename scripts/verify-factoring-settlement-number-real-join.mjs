#!/usr/bin/env node
/**
 * verify-factoring-settlement-number-real-join.mjs
 *
 * NEW-23 (owner 2026-09-07 raw findings): "Factoring is missing settlement numbers entirely --
 * wire them in (same underlying gap as CC-1's NEW-08 on the Load Costs side)."
 *
 * ROOT CAUSE, live-verified (Neon, this session): the shared rollup both factoring registers
 * consume (apps/backend/src/accounting/load-cost-rollup.sql.ts's loadCostRollupLateral())
 * resolved settlement_number via driver_bills.settled_in_settlement_id -- a column that is
 * populated ZERO times across the entire driver_finance.driver_bills table company-wide (it is
 * only set when a bill is fully settled/CLOSED, which lags far behind factoring's own AR-side
 * assignment). The REAL, already-working settlement number is assigned at BOOKING time
 * (SET-01/SET-02, book-load.service.ts) into driver_finance.settlement_lines via
 * source_driver_bill_id, in the same transaction that creates the load's driver bill -- exactly
 * the join load-costs-board.routes.ts's own settlement_info CTE already uses (NEW-08/NEW-09, PR
 * #21318). Live-verified: 109 of 111 factored invoices (98%) resolve a real settlement number
 * via the settlement_lines join; 0 resolved via the old settled_in_settlement_id path.
 *
 * WHAT IS ASSERTED: loadCostRollupLateral()'s settlement_number subquery joins through
 * driver_finance.settlement_lines.source_driver_bill_id -> driver_finance.driver_settlements,
 * NOT through driver_bills.settled_in_settlement_id.
 *
 * Usage:
 *   node scripts/verify-factoring-settlement-number-real-join.mjs            # scan
 *   node scripts/verify-factoring-settlement-number-real-join.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-settlement-number-real-join";
const ROLLUP = "apps/backend/src/accounting/load-cost-rollup.sql.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest. */
export function checkSettlementJoin(src) {
  const failures = [];
  // Extract the settlement_number subquery specifically (bounded by its own AS alias) so a
  // legitimate, unrelated use of settled_in_settlement_id elsewhere in the file (there isn't
  // one today, but this keeps the check scoped) can never trip this guard.
  const match = src.match(/SELECT ds\.display_id[\s\S]{0,600}?AS settlement_number,/);
  if (!match) {
    failures.push(`${ROLLUP}: could not find the settlement_number subquery.`);
    return failures;
  }
  const subquery = match[0];
  if (!/driver_finance\.settlement_lines\s+\w+\s+ON\s+\w+\.source_driver_bill_id\s*=\s*\w+\.id/.test(subquery)) {
    failures.push(
      `${ROLLUP}: settlement_number must join through driver_finance.settlement_lines.source_driver_bill_id ` +
        `(the real, booking-time-assigned settlement link) -- same join load-costs-board.routes.ts's ` +
        `settlement_info CTE already proves correct.`,
    );
  }
  if (/settled_in_settlement_id/.test(subquery)) {
    failures.push(
      `${ROLLUP}: settlement_number must NOT join through driver_bills.settled_in_settlement_id -- ` +
        `that column is populated 0/many times company-wide (live-verified), so this always resolves ` +
        `NULL and is exactly the NEW-23 regression.`,
    );
  }
  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(ROLLUP);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkSettlementJoin(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
    (
      SELECT ds.display_id
      FROM driver_finance.driver_bills db2
      JOIN driver_finance.settlement_lines sl2 ON sl2.source_driver_bill_id = db2.id
      JOIN driver_finance.driver_settlements ds ON ds.id = sl2.settlement_id
      WHERE db2.load_id = l.id
        AND db2.operating_company_id = l.operating_company_id
        AND db2.status <> 'void'
      ORDER BY db2.created_at DESC
      LIMIT 1
    ) AS settlement_number,
  `;
  const badOldColumn = `
    (
      SELECT ds.display_id
      FROM driver_finance.driver_bills db2
      JOIN driver_finance.driver_settlements ds ON ds.id = db2.settled_in_settlement_id
      WHERE db2.load_id = l.id
        AND db2.operating_company_id = l.operating_company_id
        AND db2.settled_in_settlement_id IS NOT NULL
      ORDER BY db2.created_at DESC
      LIMIT 1
    ) AS settlement_number,
  `;
  const badMissingSettlementLinesJoin = goodSrc.replace(
    "JOIN driver_finance.settlement_lines sl2 ON sl2.source_driver_bill_id = db2.id\n      ",
    "",
  );

  const checks = [
    ["clean rollup passes", checkSettlementJoin(goodSrc).length === 0],
    ["old settled_in_settlement_id join fails", checkSettlementJoin(badOldColumn).length > 0],
    ["missing settlement_lines join fails", checkSettlementJoin(badMissingSettlementLinesJoin).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — factoring registers' settlement number resolves via the real booking-time link (NEW-23)`);
process.exit(0);
