#!/usr/bin/env node
// LEAD 443.338 — a VOIDED driver_settlement_deduction is never applied to a settlement.
// Measured 10-24: settlement-deduction-cap.service.ts (applyPendingDeductions, run at every settlement close) selected the
// driver's unapplied deductions WITHOUT `voided_at IS NULL`. Deduction 68041143 ("Admin fee - GAS" $10.00) was voided on
// 10-12 as the duplicate of ee43793c (already taken on 5769) but kept status 'pending'; P-0119's close on 10-23 charged
// Angel Alfonso Sosa Perez that $10.00 a second time, and the payrun posting then refused P-0119 (deduction rows 0¢ vs
// lines 1000¢).
// Static (always): the cap service's pending selection carries `voided_at IS NULL`.
// Live (DATABASE_URL): 0 ACTIVE settlement lines that apply a deduction voided BEFORE the line was written.
// --selftest: the static check passes on the real source and fails on the source with the predicate removed.
import { readFileSync } from "node:fs";

import { expandLiveDocumentPredicates, PREDICATES_MODULE } from "./lib/expand-live-document-predicates.mjs";
const LABEL = "verify-voided-deduction-never-applied";
export const ALLOW_OFFLINE_SKIP = "static half (pending query filters voided_at, selftest) always runs; only the live count needs DATABASE_URL and CI runs it live";
const CAP = "apps/backend/src/driver-finance/settlement-deduction-cap.service.ts";

// #27770 spells the predicate through the canonical module (`${notVoided()}`); judge the SQL the helper really emits.
export async function staticProblems(rawSrc, helperSource) {
  const src = await expandLiveDocumentPredicates(rawSrc, helperSource);
  const m = src.match(/FROM driver_finance\.driver_settlement_deductions\s+WHERE operating_company_id = \$1::uuid\s+AND driver_id = \$2\s+AND applied_to_settlement_id IS NULL[\s\S]*?ORDER BY/);
  if (!m) return [`${CAP}: the pending-deduction selection was not found (restructured?) — re-point this guard`];
  return /voided_at IS NULL/.test(m[0]) ? [] : [`${CAP}: the pending-deduction selection does not exclude voided deductions (voided_at IS NULL)`];
}

if (process.argv.includes("--selftest")) {
  const real = readFileSync(CAP, "utf8");
  // Remove the predicate INSIDE the pending selection only (the file has another voided_at filter above it).
  const region = real.match(/AND applied_to_settlement_id IS NULL[\s\S]*?ORDER BY/)[0];
  const broken = real.replace(region, region.replace(/\n\s*AND (?:voided_at IS NULL|\$\{notVoided\(\)\})/, ""));
  // Original defect, second spelling: the call stays but the canonical helper stops emitting the predicate.
  const helperReal = readFileSync(PREDICATES_MODULE, "utf8");
  const helperBroken = helperReal.replace('"voided_at IS NULL"', '"TRUE"');
  const ok =
    (await staticProblems(real)).length === 0 &&
    broken !== real && (await staticProblems(broken)).length === 1 &&
    helperBroken !== helperReal && (await staticProblems(real, helperBroken)).length === 1;
  console.log(`${LABEL} --selftest ${ok ? "PASS" : "FAIL"} — real source clean; predicate removed is caught; helper that stops emitting it is caught`);
  process.exit(ok ? 0 : 1);
}

const fails = await staticProblems(readFileSync(CAP, "utf8"));
let live = "live half skipped (no DATABASE_URL)";
if (!fails.length && process.env.DATABASE_URL) {
  const { default: pg } = await import("pg");
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000 });
  await c.connect();
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const r = await c.query(
      `SELECT s.display_id, d.id::text AS deduction_id, sl.amount::text
         FROM driver_finance.settlement_lines sl
         JOIN driver_finance.driver_settlement_deductions d ON d.id = sl.source_reference_id
         JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
        WHERE sl.line_type = 'deduction' AND sl.is_active
          AND d.voided_at IS NOT NULL AND d.voided_at < sl.created_at
        ORDER BY 1`);
    await c.query("ROLLBACK");
    if (r.rows.length) fails.push(`${r.rows.length} active settlement line(s) apply a deduction voided before the line: ${r.rows.map((x) => `${x.display_id} ${x.deduction_id} $${x.amount}`).join("; ")}`);
    live = `live: ${r.rows.length} active line(s) on a previously-voided deduction`;
  } finally {
    await c.end();
  }
}
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — voided deductions are never applied; ${live}`);
