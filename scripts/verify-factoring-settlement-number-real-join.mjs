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
 * WHAT IS ASSERTED (443.210R refactor): resolveLoadSettlementSql() in settlement-resolution.sql.ts
 * (the 443.210R single canonical resolver that loadCostRollupLateral delegates to) joins through
 * driver_finance.settlement_lines.source_driver_bill_id -> driver_finance.driver_settlements,
 * NOT through driver_bills.settled_in_settlement_id.
 * load-cost-rollup.sql.ts must delegate to resolveLoadSettlementSql (no inline resolver).
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
const RESOLUTION = "apps/backend/src/driver-finance/settlement-resolution.sql.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/**
 * Checks settlement-resolution.sql.ts for the canonical source_document_ref / settlement_lines
 * join pattern. Exported for --selftest.
 */
export function checkSettlementJoin(src) {
  const failures = [];
  // Settlement number must come from source_document_ref (Rule 03 AlwaysTrack display id).
  if (!/ds\.source_document_ref\s+AS\s+settlement_number/.test(src)) {
    failures.push(`${RESOLUTION}: could not find settlement_number from source_document_ref.`);
    return failures;
  }
  // Must join through settlement_lines (the booking-time-assigned link, not the lagging settled_in_settlement_id).
  if (!/driver_finance\.settlement_lines/.test(src)) {
    failures.push(
      `${RESOLUTION}: settlement_number must join through driver_finance.settlement_lines ` +
        `(the real, booking-time-assigned settlement link via source_driver_bill_id).`,
    );
  }
  if (!/source_driver_bill_id/.test(src)) {
    failures.push(
      `${RESOLUTION}: settlement_number must join through settlement_lines.source_driver_bill_id ` +
        `-- same join load-costs-board.routes.ts's settlement_info CTE already proves correct.`,
    );
  }
  if (/settled_in_settlement_id/.test(src)) {
    failures.push(
      `${RESOLUTION}: settlement_number must NOT join through driver_bills.settled_in_settlement_id -- ` +
        `that column is populated 0 times company-wide (live-verified NEW-23 regression).`,
    );
  }
  return failures;
}

export function run() {
  const failures = [];
  // 1. Canonical resolver in settlement-resolution.sql.ts must use settlement_lines/source_driver_bill_id.
  const { ok: resOk, src: resSrc, err: resErr } = read(RESOLUTION);
  if (!resOk) {
    failures.push(resErr);
    return { ok: false, failures };
  }
  failures.push(...checkSettlementJoin(resSrc));

  // 2. load-cost-rollup.sql.ts must delegate to resolveLoadSettlementSql (443.210R one-resolver rule)
  //    and expose lc_settlement_id for EntityLink drills (BANK-F91021).
  const { ok, src, err } = read(ROLLUP);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  if (!src.includes("resolveLoadSettlementSql")) {
    failures.push(`${ROLLUP}: must delegate to resolveLoadSettlementSql from settlement-resolution.sql.ts (443.210R one-resolver rule).`);
  }
  if (!/lc_settlement_id/.test(src)) {
    failures.push(`${ROLLUP}: must expose lc_settlement_id for EntityLink drills (BANK-F91021).`);
  }
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  // goodSrc: matches the shape of resolveLoadSettlementSql in settlement-resolution.sql.ts
  const goodSrc = `
    export function resolveLoadSettlementSql(loadAlias) {
      return \`LEFT JOIN LATERAL (
        SELECT ds.id::text AS settlement_id, ds.source_document_ref AS settlement_number
          FROM driver_finance.driver_settlements ds
         WHERE ds.id = COALESCE(
           (SELECT sl1.settlement_id
              FROM driver_finance.settlement_lines sl1
              JOIN driver_finance.driver_bills db1
                ON db1.id = sl1.source_driver_bill_id
             LIMIT 1)
         )
         LIMIT 1
      ) load_settlement ON true\`;
    }
  `;
  const badOldColumn = `
    export function resolveLoadSettlementSql(loadAlias) {
      return \`SELECT ds.source_document_ref AS settlement_number
        FROM driver_finance.driver_settlements ds
       WHERE ds.id = (
         SELECT db2.settled_in_settlement_id FROM driver_finance.driver_bills db2
          WHERE db2.load_id = l.id AND db2.settled_in_settlement_id IS NOT NULL
          LIMIT 1
       )\`;
    }
  `;
  const badMissingSettlementLinesJoin = `
    export function resolveLoadSettlementSql(loadAlias) {
      return \`SELECT ds.source_document_ref AS settlement_number
        FROM driver_finance.driver_settlements ds
       WHERE ds.id = (
         SELECT db2.direct_settlement_id FROM driver_finance.driver_bills db2
          WHERE db2.load_id = l.id LIMIT 1
       )\`;
    }
  `;

  const checks = [
    ["clean resolver passes", checkSettlementJoin(goodSrc).length === 0],
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
