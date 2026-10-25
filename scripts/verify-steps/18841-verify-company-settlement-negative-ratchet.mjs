#!/usr/bin/env node
/**
 * verify-18841-company-settlement-negative-ratchet
 *
 * ENG-36: ensures the count of negative-net USMCA company settlements never grows above
 * the baseline established after the rate_total_cents fallback fix.
 *
 * Baseline (measured 2026-10-25 after fix): 21 negative settlements out of 87.
 * The ceiling is stored in RATCHET_CEILING below and shrinks only when the PR author
 * lowers it after verifying the improvement on prod.
 *
 * A settlement is "negative" when:
 *   revenue (load_charge_lines OR rate_total_cents fallback)
 *   - driver_settlement_lines (salary + deduction types)
 *   - fuel_transactions
 *   - non-fuel expenses
 *   < 0
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const STEP = 18841;
const RATCHET_CEILING = 21; // shrink-only; lower after confirmed prod improvement
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const NET_REVENUE_LINE_TYPES = [
  "earnings",
  "team_split_primary",
  "team_split_secondary",
  "extra_pay",
  "reimbursement",
  "deduction",
  "advance_recovery",
  "abandonment_chargeback",
  "auto_deduction",
  "dispute_adjustment",
  "detention_pay",
  "deadhead_pay",
];

// --selftest: assert this file's own logic is internally consistent
if (process.argv.includes("--selftest")) {
  if (typeof RATCHET_CEILING !== "number" || RATCHET_CEILING < 0) {
    console.error("SELFTEST FAIL — RATCHET_CEILING must be a non-negative integer");
    process.exit(1);
  }
  if (NET_REVENUE_LINE_TYPES.length < 5) {
    console.error("SELFTEST FAIL — line type list looks truncated");
    process.exit(1);
  }
  console.log("SELFTEST OK");
  process.exit(0);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    `verify-${STEP}-company-settlement-negative-ratchet: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B owner ruling).`
  );
  process.exit(1);
}

const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const pg = require("pg");
const client = new pg.Client(buildPgClientConfig(DATABASE_URL));
await client.connect();

const SQL_BYPASS = `SET LOCAL app.bypass_rls = 'lucia'`;
const SQL_COUNT = `
WITH usmca AS (SELECT $1::uuid AS oc),
cs_all AS (
  SELECT cs.id
  FROM accounting.company_settlements cs, usmca u
  WHERE cs.operating_company_id = u.oc AND cs.voided_at IS NULL
),
links AS (
  SELECT DISTINCT csds.company_settlement_id AS cs_id, csds.driver_settlement_id AS ds_id
  FROM accounting.company_settlement_driver_settlements csds
  JOIN cs_all c ON c.id = csds.company_settlement_id
),
cs_loads AS (
  SELECT DISTINCT lk.cs_id, sl.load_id
  FROM links lk
  JOIN driver_finance.settlement_lines sl ON sl.settlement_id = lk.ds_id
  WHERE sl.load_id IS NOT NULL AND sl.is_active = true
),
revenue AS (
  SELECT cl.cs_id,
    SUM(COALESCE(
      (SELECT SUM(ROUND(lcl.amount_cents)::bigint)
       FROM dispatch.load_charge_lines lcl
       WHERE lcl.load_id = cl.load_id
         AND lcl.operating_company_id = $1::uuid
         AND lcl.is_active = true),
      l.rate_total_cents
    )) AS cents
  FROM cs_loads cl
  JOIN mdata.loads l ON l.id = cl.load_id
  GROUP BY cl.cs_id
),
line_cost AS (
  SELECT lk.cs_id, SUM(ROUND(sl.amount * 100)::bigint) AS cents
  FROM links lk
  JOIN driver_finance.settlement_lines sl ON sl.settlement_id = lk.ds_id
  WHERE sl.is_active = true AND sl.line_type = ANY($2::text[])
  GROUP BY lk.cs_id
),
fuel AS (
  SELECT cl.cs_id, SUM(ROUND(ft.total_cost * 100)::bigint) AS cents
  FROM cs_loads cl
  JOIN fuel.fuel_transactions ft ON ft.load_id = cl.load_id
  JOIN usmca u ON ft.operating_company_id = u.oc
  WHERE ft.voided_at IS NULL AND ft.archived_at IS NULL
  GROUP BY cl.cs_id
),
expense AS (
  SELECT cl.cs_id, SUM(ROUND(e.total_amount_cents)::bigint) AS cents
  FROM cs_loads cl
  JOIN accounting.expenses e ON e.load_id = cl.load_id
  JOIN usmca u ON e.operating_company_id = u.oc
  WHERE e.voided_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM fuel.fuel_transactions eft
      WHERE eft.id = e.source_fuel_transaction_id
        AND eft.operating_company_id = $1::uuid
        AND eft.load_id = ANY(ARRAY(SELECT cl2.load_id FROM cs_loads cl2 WHERE cl2.cs_id = cl.cs_id))
        AND eft.voided_at IS NULL AND eft.archived_at IS NULL
    )
  GROUP BY cl.cs_id
)
SELECT COUNT(*)::int AS negative_count
FROM cs_all c
LEFT JOIN revenue r ON r.cs_id = c.id
LEFT JOIN line_cost lc ON lc.cs_id = c.id
LEFT JOIN fuel f ON f.cs_id = c.id
LEFT JOIN expense x ON x.cs_id = c.id
WHERE (COALESCE(r.cents,0) - COALESCE(lc.cents,0) - COALESCE(f.cents,0) - COALESCE(x.cents,0)) < 0
`;

let negativeCount;
try {
  await client.query("BEGIN");
  await client.query(SQL_BYPASS);
  const res = await client.query(SQL_COUNT, [USMCA, NET_REVENUE_LINE_TYPES]);
  await client.query("ROLLBACK");
  negativeCount = res.rows[0].negative_count;
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  throw err;
} finally {
  await client.end();
}

if (negativeCount > RATCHET_CEILING) {
  console.error(`[verify-${STEP}] FAILED — 1 issue(s):`);
  console.error(
    `  RATCHET BREACH — ${negativeCount} negative company settlements exceeds ceiling of ${RATCHET_CEILING}. ` +
    `ENG-36 fix (rate_total_cents fallback) must be applied or the ceiling re-measured on prod.`
  );
  process.exit(1);
}

console.log(
  `[verify-${STEP}] PASS — ${negativeCount} of ≤${RATCHET_CEILING} company settlements negative (rate_total_cents fallback active)`
);
process.exit(0);
