#!/usr/bin/env node
/**
 * GUARD — OWNER RULING (Lead 443.52 B, CC-3) / LAW-2026-10-11-EXPENSE-SETTLEMENT-NUMBER-REQUIRES-LOAD:
 * an expense with a settlement number must have a load number.
 *   RULE 1 (static) — migration 202615540900 adds CHECK expenses_settlement_no_requires_load (write-time refusal for every writer).
 *   RULE 2 (live) — 0 USMCA expenses (ALL of them, voided included) carry a settlement number and no load.
 *   RULE 3 (live) — once applied, the constraint exists on accounting.expenses and is VALIDATED (convalidated = true).
 * Run: node scripts/verify-settlement-creator-expense-settlement-has-load.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "a settlement expense without its load is live money — fails closed without a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-expense-settlement-has-load";
const MIG = "db/migrations/202615540900_expenses_settlement_no_requires_load.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function staticProblems(mig) {
  return /ADD CONSTRAINT expenses_settlement_no_requires_load\s+CHECK \(settlement_no IS NULL OR btrim\(settlement_no\) = '' OR load_id IS NOT NULL\)/.test(mig) &&
    /VALIDATE CONSTRAINT expenses_settlement_no_requires_load/.test(mig)
    ? [] : ["RULE 1 migration 202615540900 no longer adds + validates CHECK expenses_settlement_no_requires_load"];
}

export function liveProblems({ violating, constraint }) {
  const p = [];
  if (Number(violating) > 0) p.push(`RULE 2 ${violating} USMCA expense(s) carry a settlement number and no load`);
  if (constraint && constraint.convalidated !== true) p.push("RULE 3 expenses_settlement_no_requires_load exists but is NOT VALIDATED");
  return p;
}

function selftest() {
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const cases = [
    ["real migration clean", staticProblems(mig).length === 0],
    ["CHECK dropped fails", staticProblems(mig.replace("OR load_id IS NOT NULL", "")).length > 0],
    ["VALIDATE dropped fails", staticProblems(mig.replace("VALIDATE CONSTRAINT", "-- ")).length > 0],
    ["clean live passes", liveProblems({ violating: 0, constraint: { convalidated: true } }).length === 0],
    ["pending constraint passes", liveProblems({ violating: 0, constraint: null }).length === 0],
    ["a violating expense fails", liveProblems({ violating: 1, constraint: { convalidated: true } }).length > 0],
    ["unvalidated constraint fails", liveProblems({ violating: 0, constraint: { convalidated: false } }).length > 0],
  ];
  const bad = cases.filter(([, ok]) => !ok).map(([n]) => n);
  if (bad.length) { console.error(`${LABEL} selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${cases.length}/${cases.length})`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = staticProblems(fs.readFileSync(path.join(ROOT, MIG), "utf8"));
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let m;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const r = (await client.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE settlement_no IS NOT NULL AND btrim(settlement_no) <> '')::int AS with_settlement,
              count(*) FILTER (WHERE settlement_no IS NOT NULL AND btrim(settlement_no) <> '' AND load_id IS NULL)::int AS violating
         FROM accounting.expenses WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0];
    const constraint = (await client.query(
      `SELECT convalidated FROM pg_constraint WHERE conname = 'expenses_settlement_no_requires_load' AND conrelid = 'accounting.expenses'::regclass`)).rows[0] ?? null;
    m = { ...r, constraint };
    await client.query("ROLLBACK");
  } finally {
    client.release?.(); await pool?.end?.();
  }
  p.push(...liveProblems(m));
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS — ${m.total} USMCA expenses, ${m.with_settlement} with a settlement number, 0 without a load; constraint ${m.constraint ? "validated" : "pending deploy"}`);
}
