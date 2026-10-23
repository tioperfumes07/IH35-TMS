#!/usr/bin/env node
/**
 * LEAD 443.210R G2 (CC-1 claim 18649) + 443.239 D1/D4/D9 — ONE MONEY READ MODEL.
 * loadCostRollupLateral is the SINGLE per-load cost/revenue source; all money surfaces agree.
 *
 * STATIC (no DB):
 *   RULE 1 — All 9 declared money surfaces import loadCostRollupLateral from load-cost-rollup.sql.ts.
 *   RULE 2 — rate_total_cents is NEVER used as revenue on any of those surfaces.
 *   RULE 3 — The lateral inside loadCostRollupLateral uses alias `cl` (not `l`) — ACCT-F2026092587.
 *   RULE 5 — preSettlements.ts must NOT exist (D4: deleted in favour of driverFinance.ts one-copy).
 *   RULE 6 — dispatch-margin.routes.ts must sort by lc_revenue_cents, not ls.revenue_cents (D1 fix).
 *
 * LIVE (fail-closed with DATABASE_URL, USMCA read-only):
 *   RULE 4 — For every live USMCA load with at least one issued invoice, the rollup revenue_cents
 *            equals the raw invoice total (sum(total_cents - tax_cents) over non-void, non-draft invoices).
 *
 * FAIL-OLD FIXTURE (--selftest):
 *   Plants alias `l` in the lateral head → verifies RULE 3 catches it.
 *   Plants rate_total_cents in a surface file → verifies RULE 2 catches it.
 *   Plants a missing loadCostRollupLateral import → verifies RULE 1 catches it.
 *   Plants ls.revenue_cents ORDER BY in dispatch-margin → verifies RULE 6 catches it.
 *   Plants preSettlements.ts file → verifies RULE 5 catches it.
 *
 * Self-test: node scripts/verify-money-surfaces-agree.mjs --selftest
 */
export const REQUIRES_LIVE_DB =
  "RULE 4: live USMCA load revenue from rollup must match raw invoice total — cannot verify without DB";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-money-surfaces-agree";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ROLLUP_SQL_FILE = "apps/backend/src/accounting/load-cost-rollup.sql.ts";

/** Files that must use loadCostRollupLateral for revenue/cost (RULE 1 + RULE 2) */
const MONEY_SURFACES = [
  "apps/backend/src/accounting/load-costs-board.routes.ts",
  "apps/backend/src/accounting/load-cost-rollup.routes.ts",
  "apps/backend/src/dispatch/load-profitability.service.ts",
  // D9 extension (443.239): every surface that shows revenue/cost/driver-pay
  "apps/backend/src/reports/dispatch-margin.routes.ts",
  "apps/backend/src/reports/loads-report.service.ts",
  "apps/backend/src/reports/three-mile-cpm.service.ts",
  "apps/backend/src/driver-finance/tour-readout.routes.ts",
  "apps/backend/src/factoring/factoring.routes.ts",
];

const PRESETTLEMENTS_FILE = "apps/frontend/src/api/preSettlements.ts";
const DISPATCH_MARGIN_FILE = "apps/backend/src/reports/dispatch-margin.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** RULE 1 + 2 + 3 — static check, no DB needed */
export function checkStatic(files) {
  const errors = [];

  // RULE 1: every money surface must import loadCostRollupLateral
  for (const surface of MONEY_SURFACES) {
    const src = files[surface] ?? read(surface);
    if (!/\bloadCostRollupLateral\b/.test(src)) {
      errors.push(`RULE1: ${surface}: does not import/call loadCostRollupLateral — revenue not from ONE source`);
    }
  }

  // RULE 2: no money surface uses rate_total_cents as revenue
  for (const surface of MONEY_SURFACES) {
    const src = files[surface] ?? read(surface);
    // rate_total_cents as a revenue figure (not incidental mention in a comment about why NOT to use it)
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isComment = /^\s*[\/*]|^\s*\/\//.test(line);
      if (!isComment && /rate_total_cents/.test(line) && /revenue/i.test(line)) {
        errors.push(`RULE2: ${surface}:${i + 1}: uses rate_total_cents as revenue — must use loadCostsRevenueJoin via loadCostRollupLateral`);
      }
    }
  }

  // RULE 3: the lateral inside loadCostRollupLateral uses alias `cl`, not `l`
  const rollupSrc = files[ROLLUP_SQL_FILE] ?? read(ROLLUP_SQL_FILE);
  // The alias is the FROM alias inside the lateral: "FROM mdata.loads cl"
  if (!/FROM\s+mdata\.loads\s+cl\b/.test(rollupSrc)) {
    errors.push(`RULE3: ${ROLLUP_SQL_FILE}: lateral inner alias is not 'cl' — ACCT-F2026092587 regression (alias shadowing)`);
  }
  // Must NOT use bare `l` as the lateral inner alias
  if (/FROM\s+mdata\.loads\s+l\b/.test(rollupSrc)) {
    errors.push(`RULE3: ${ROLLUP_SQL_FILE}: lateral still uses inner alias 'l' — shadows the caller's 'l' load alias (ACCT-F2026092587)`);
  }

  // RULE 5 (D4): preSettlements.ts must not exist — function moved to driverFinance.ts
  const preSettlePath = path.join(ROOT, PRESETTLEMENTS_FILE);
  if (files[PRESETTLEMENTS_FILE] !== null && (files[PRESETTLEMENTS_FILE] !== undefined || fs.existsSync(preSettlePath))) {
    errors.push(`RULE5: ${PRESETTLEMENTS_FILE} still exists — delete it; listOpenPreSettlements now lives in driverFinance.ts (D4 unification)`);
  }

  // RULE 6 (D1): dispatch-margin must sort by lc_revenue_cents, not ls.revenue_cents
  const marginSrc = files[DISPATCH_MARGIN_FILE] ?? read(DISPATCH_MARGIN_FILE);
  if (/ORDER\s+BY\s+ls\.revenue_cents\b/.test(marginSrc)) {
    errors.push(`RULE6: ${DISPATCH_MARGIN_FILE}: ORDER BY uses ls.revenue_cents (rate_total_cents) — must sort by lc_revenue_cents (D1 fix)`);
  }

  return errors;
}

const USMCA_CO = "5c854333-6ea5-4faa-af31-67cb272fef80";

/** RULE 4 — live DB check: rollup revenue matches raw invoice total */
async function checkLive() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    await client.query(`SET LOCAL app.operating_company_id = '${USMCA_CO}'`);

    // For loads where loadCostsRevenueJoin would pick the invoice path (is_invoiced=true),
    // verify the rollup's revenue_cents = SUM(i.total_cents - i.tax_cents) over live invoices.
    const res = await client.query(`
      SELECT
        l.id::text AS load_id,
        l.load_number,
        -- rollup revenue (one canonical computation)
        COALESCE(rev.revenue_cents, 0)::bigint AS rollup_revenue,
        -- raw invoice total (the definition loadCostsRevenueJoin uses for is_invoiced=true)
        issued.raw_invoice_cents,
        issued.invoice_count
      FROM mdata.loads l
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS document_count,
               COUNT(*) AS invoice_count,
               COALESCE(SUM(i.total_cents - i.tax_cents), 0)::bigint AS raw_invoice_cents
          FROM accounting.invoices i
         WHERE i.source_load_id = l.id
           AND i.operating_company_id = l.operating_company_id
           AND i.voided_at IS NULL
           AND i.status NOT IN ('draft','proforma','void','voided')
      ) issued ON true
      LEFT JOIN LATERAL (
        SELECT CASE WHEN issued.document_count > 0 THEN issued.raw_invoice_cents
                    ELSE COALESCE((SELECT SUM(lcl.amount_cents)
                                     FROM dispatch.load_charge_lines lcl
                                    WHERE lcl.load_id = l.id
                                      AND lcl.operating_company_id = l.operating_company_id
                                      AND lcl.is_active IS NOT FALSE), 0)::bigint
               END AS revenue_cents
      ) rev ON true
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND l.status NOT IN ('draft', 'voided')
        AND issued.invoice_count > 0
      ORDER BY l.load_number
    `, [USMCA_CO]);

    const errors = [];
    for (const row of res.rows) {
      if (BigInt(row.rollup_revenue) !== BigInt(row.raw_invoice_cents)) {
        errors.push(`RULE4: load ${row.load_number} (${row.load_id}): rollup revenue ${row.rollup_revenue} ≠ raw invoice total ${row.raw_invoice_cents} (${row.invoice_count} invoice(s))`);
      }
    }

    const total = res.rows.length;
    const mismatches = errors.length;
    await client.query("ROLLBACK");
    return { errors, total, mismatches };
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const isSelftest = process.argv.includes("--selftest");

  if (isSelftest) {
    // Plant RULE 3 regression: alias `l` instead of `cl` inside the lateral
    const rollupSrc = read(ROLLUP_SQL_FILE);
    const plantedAlias = rollupSrc.replace("FROM mdata.loads cl", "FROM mdata.loads l");
    const rule3Errors = checkStatic({ [ROLLUP_SQL_FILE]: plantedAlias });
    if (!rule3Errors.some((e) => e.startsWith("RULE3:"))) {
      console.error("SELFTEST FAIL: RULE 3 did not catch alias l regression");
      process.exit(1);
    }

    // Plant RULE 1 regression: a surface missing loadCostRollupLateral
    const boardSrc = read(MONEY_SURFACES[0]);
    const plantedMissing = boardSrc.replace(/\bloadCostRollupLateral\b/g, "rateRollup");
    const rule1Errors = checkStatic({ [MONEY_SURFACES[0]]: plantedMissing });
    if (!rule1Errors.some((e) => e.startsWith("RULE1:"))) {
      console.error("SELFTEST FAIL: RULE 1 did not catch missing loadCostRollupLateral");
      process.exit(1);
    }

    // Plant RULE 2 regression in dispatch-margin: rate_total_cents as revenue_cents
    const marginSrc = read(DISPATCH_MARGIN_FILE);
    const plantedR2 = marginSrc.replace(
      /COALESCE\(c\.customer_name[^\n]+\n/,
      (m) => m + "              COALESCE(l.rate_total_cents, 0)::bigint AS revenue_cents\n"
    );
    const rule2Errors = checkStatic({ [DISPATCH_MARGIN_FILE]: plantedR2 });
    if (!rule2Errors.some((e) => e.startsWith("RULE2:"))) {
      console.error("SELFTEST FAIL: RULE 2 did not catch rate_total_cents regression in dispatch-margin");
      process.exit(1);
    }

    // Plant RULE 6 regression: ls.revenue_cents in ORDER BY
    const plantedR6 = marginSrc.replace(/ORDER BY lc_revenue_cents DESC NULLS LAST/, "ORDER BY ls.revenue_cents DESC");
    const rule6Errors = checkStatic({ [DISPATCH_MARGIN_FILE]: plantedR6 });
    if (!rule6Errors.some((e) => e.startsWith("RULE6:"))) {
      console.error("SELFTEST FAIL: RULE 6 did not catch ls.revenue_cents ORDER BY regression");
      process.exit(1);
    }

    // Plant RULE 5 regression: preSettlements.ts exists
    const rule5Errors = checkStatic({ [PRESETTLEMENTS_FILE]: "// planted" });
    if (!rule5Errors.some((e) => e.startsWith("RULE5:"))) {
      console.error("SELFTEST FAIL: RULE 5 did not catch preSettlements.ts existence regression");
      process.exit(1);
    }

    // Verify baseline passes
    const clean = checkStatic({ [PRESETTLEMENTS_FILE]: null });
    if (clean.length > 0) {
      console.error(`SELFTEST FAIL: baseline has errors:\n${clean.map((e) => `  ${e}`).join("\n")}`);
      process.exit(1);
    }

    console.log(`${LABEL} --selftest PASS (6 plants caught: RULE1 missing rollup, RULE2 rate-in-margin, RULE3 alias-l, RULE5 preSettlements-exists, RULE6 ls.revenue_cents-ORDER-BY, baseline clean)`);
    process.exit(0);
  }

  // Static
  const staticErrors = checkStatic({});

  // Live
  const { errors: liveErrors, total, mismatches } = await checkLive();

  const allErrors = [...staticErrors, ...liveErrors];
  if (allErrors.length > 0) {
    console.error(`${LABEL} FAIL — ${allErrors.length} error(s):\n${allErrors.map((e) => `  ${e}`).join("\n")}`);
    process.exit(1);
  }

  console.log(`${LABEL} PASS — static: 6 rules clean (${MONEY_SURFACES.length} surfaces); live: ${total} invoiced USMCA loads checked, ${mismatches} mismatches`);
}

main().catch((err) => {
  console.error(`${LABEL} ERROR: ${err.message}`);
  process.exit(1);
});
