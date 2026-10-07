#!/usr/bin/env node
/**
 * GUARD (RELAY-F441, ROUND 441.15): every Relay fill's fuel_items[] is parsed into typed lines, and the lines account for
 * the money paid.
 *
 * Relay sends `fuel_items` (the per-product breakdown: fuel_type, product code, volume, per-unit and total prices, fee).
 * The reefer gallons in it feed the federal off-highway credit (owner, 2026-10-04), and reefer is its own GL account and
 * item, so a fill whose breakdown is lost posts as one undifferentiated amount. The ingest
 * (relay-fuel-ingest.service.ts) writes each item to integrations.relay_fuel_transaction_lines, converting the dollar
 * strings through the shared dollarsToCents helper. Measured 2026-10-07 (prod): 1,764 live fills, 0 with items but no
 * lines, 0 line-count mismatches, 0 fills whose line totals differ from total_amount_paid_cents. This guard keeps it that
 * way.
 *
 * STATIC (always runs), on relay-fuel-ingest.service.ts:
 *   S1 each fuel_items entry is inserted into integrations.relay_fuel_transaction_lines
 *   S2 money in fuel_items is converted by dollarsToCents / optionalDollarsToCents (the edge helper), never Number()*100
 * LIVE (with a credential):
 *   L1 no live fill has a non-empty raw_payload->'fuel_items' and no active parsed lines
 *   L2 no live fill has a different number of active lines than fuel_items entries
 *   L3 for every live fill with lines, the lines' total_discounted_price_cents sum to total_amount_paid_cents
 *
 * Run: node scripts/verify-relay-fuel-items-parsed.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-relay-fuel-items-parsed";
const INGEST = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts";
// verify-no-silent-db-skip (03d): S1–S2 always run and fail closed; L1–L3 run whenever a credential resolves, and the OK
// line says "static only" when one did not.
export const ALLOW_OFFLINE_SKIP = "static S1–S2 always run and fail closed; live L1–L3 run whenever a credential resolves";

export function staticProblems(src) {
  const p = [];
  if (!/for \(let i = 0; i < fuelItems\.length; i \+= 1\)[\s\S]{0,400}INSERT INTO integrations\.relay_fuel_transaction_lines\s*\(/.test(src)) {
    p.push("S1: the ingest no longer writes each fuel_items entry to integrations.relay_fuel_transaction_lines");
  }
  if (!/const fuelItems = tx\.fuel_items/.test(src) || !/optionalDollarsToCents\(item\.retail_price_per_unit/.test(src) ||
      !/DollarsToCents\(item\.total_discounted_price|dollarsToCents\(item\.total_discounted_price/.test(src)) {
    p.push("S2: fuel_items money must be converted by the dollarsToCents edge helpers");
  }
  if (/Number\(item\.[a-z_]+\)\s*\*\s*100/.test(src)) {
    p.push("S2: fuel_items money converted with Number()*100 — use the dollarsToCents edge helper");
  }
  return p;
}

const LIVE_SQL = `
  WITH t AS (
    SELECT t.id, t.transaction_id, t.total_amount_paid_cents AS paid,
           jsonb_array_length(CASE WHEN jsonb_typeof(t.raw_payload->'fuel_items') = 'array' THEN t.raw_payload->'fuel_items' ELSE '[]'::jsonb END) AS n_items,
           (SELECT count(*) FROM integrations.relay_fuel_transaction_lines l
             WHERE l.relay_fuel_transaction_id = t.id AND l.is_active AND l.voided_at IS NULL) AS n_lines,
           (SELECT COALESCE(sum(l.total_discounted_price_cents), 0) FROM integrations.relay_fuel_transaction_lines l
             WHERE l.relay_fuel_transaction_id = t.id AND l.is_active AND l.voided_at IS NULL) AS lines_sum
      FROM integrations.relay_fuel_transactions t
     WHERE t.voided_at IS NULL AND COALESCE(t.is_active, true))
  SELECT transaction_id, paid::text, n_items::int, n_lines::int, lines_sum::text FROM t
   WHERE (n_items > 0 AND n_lines = 0) OR n_items <> n_lines OR (n_lines > 0 AND lines_sum <> paid)
   ORDER BY transaction_id LIMIT 50`;

/** L1–L3 for one offending row (exported for the selftest). */
export function rowProblems(r) {
  const p = [];
  if (r.n_items > 0 && r.n_lines === 0) p.push(`L1: ${r.transaction_id} has ${r.n_items} fuel_items and no parsed lines`);
  else if (r.n_items !== r.n_lines) p.push(`L2: ${r.transaction_id} has ${r.n_items} fuel_items but ${r.n_lines} parsed lines`);
  if (r.n_lines > 0 && String(r.lines_sum) !== String(r.paid)) p.push(`L3: ${r.transaction_id} lines total ${r.lines_sum} ≠ paid ${r.paid}`);
  return p;
}

const src = fs.readFileSync(path.join(ROOT, INGEST), "utf8");

if (process.argv.includes("--selftest")) {
  const real = staticProblems(src);
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${real.join("\n  - ")}`);
    process.exit(1);
  }
  const cases = [
    ["S1", staticProblems(src.replace("INSERT INTO integrations.relay_fuel_transaction_lines", "INSERT INTO integrations.relay_fuel_transaction_lines_retired"))],
    ["S2", staticProblems(src.replace("optionalDollarsToCents(item.retail_price_per_unit", "Number(item.retail_price_per_unit) * 100 + (0 as never) || optionalDollarsToCentsX(item.retail_price_per_unit"))],
    ["L1", rowProblems({ transaction_id: "t", paid: "100", n_items: 2, n_lines: 0, lines_sum: "0" })],
    ["L2", rowProblems({ transaction_id: "t", paid: "100", n_items: 2, n_lines: 1, lines_sum: "100" })],
    ["L3", rowProblems({ transaction_id: "t", paid: "59433", n_items: 2, n_lines: 2, lines_sum: "59633" })],
  ];
  const clean = rowProblems({ transaction_id: "t", paid: "59433", n_items: 2, n_lines: 2, lines_sum: "59433" });
  const missed = cases.filter(([rule, probs]) => !probs.some((x) => x.startsWith(rule))).map(([r]) => r);
  if (missed.length || clean.length) {
    console.error(`${LABEL} --selftest FAIL — not caught: ${missed.join(", ")}${clean.length ? `; clean row flagged: ${clean.join("; ")}` : ""}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — real tree clean; ${cases.length}/${cases.length} rules proven able to fail (S1–S2, L1–L3)`);
  process.exit(0);
}

const problems = staticProblems(src);
let live = false;
const url = process.env.DATABASE_URL || process.env.DATABASE_DIRECT_URL;
if (url) {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    const r = await client.query(LIVE_SQL);
    await client.query("ROLLBACK");
    for (const row of r.rows) problems.push(...rowProblems(row));
    live = true;
  } finally {
    client.release();
    await pool.end();
  }
}
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
  for (const x of problems) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — fuel_items parsed into typed lines through the dollar-string helper${live ? "; live: every fill's lines exist, match its items and sum to what was paid" : " (static only — no credential)"}`);
