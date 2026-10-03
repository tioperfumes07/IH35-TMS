#!/usr/bin/env node
// ALL-SEATS ORDER "KILL THE SECOND SYSTEM" — driver_settlement_deductions.remaining_balance_cents (CC-2).
// THE POLICY STAYS (amount_cents, reason, type, load, hold). THE BALANCE IS DERIVED: amount_cents minus the deduction's
// active settlement deduction lines — driver_finance.v_settlement_deduction_balances (migration 202615340800). A pending
// deduction is not in the GL until a settlement applies it, so its lines are the posted record a CPA recomputes from.
// Static:
//   1. the view keeps that derivation;
//   2. the settlement materializer (the writer of deduction lines) reads the DERIVED remaining, never the column — so a
//      deduction already taken on any settlement can never be deducted again;
//   3. backend files still touching the column are a COMMITTED, shrink-only list (method step 2: repoint the readers,
//      then the column is dropped). A new file FAILS; a file that stops touching it must be removed from the list.
// Live (DATABASE_URL), UNSCOPED (every company):
//   4. no deduction is applied for more than its amount — ceiling 0;
//   5. stored-vs-derived drift only on the named purge population (5 ids measured 2026-10-03); a new drifted row FAILS.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "derives every settlement deduction's balance from its settlement lines, unscoped";

const LABEL = "verify-settlement-deduction-balance-derived";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615340800_settlement_deduction_derived_balance.sql";
const MATERIALIZE = "apps/backend/src/driver-finance/settlement-lines-materialize.service.ts";

/** Backend files still touching remaining_balance_cents for settlement deductions — SHRINK-ONLY (method step 2). */
export const COLUMN_DEBT = [
  "apps/backend/src/accounting/settlement-posting/recover-from-driver.service.ts",
  "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts",
  "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts",
  "apps/backend/src/driver-finance/deductions.routes.ts",
  "apps/backend/src/driver-finance/deductions.service.ts",
  "apps/backend/src/driver-finance/escrow-deduction-pending.service.ts",
  "apps/backend/src/driver-finance/escrow-separation.service.ts",
  "apps/backend/src/driver-finance/retype-settlement-deduction.service.ts",
  "apps/backend/src/driver-finance/settlement-deduction-void.service.ts",
  "apps/backend/src/driver-finance/settlement-lines-materialize.service.ts",
  "apps/backend/src/driver-finance/settlement-payrun-close.service.ts",
  "apps/backend/src/mdata/canonical/driver-profile.service.ts",
  "apps/backend/src/payroll/driver-settlement.service.deprecated.ts",
  "apps/backend/src/payroll/settlement-shadow.service.ts",
  "apps/backend/src/settlements/auto-deductions/apply.ts",
];
/** Purge population: deductions whose stored column drifted from their lines before the derivation existed. */
export const DRIFT_DEBT = new Set([
  "d959ef16-d8cc-4cb0-a3f3-0f603769ba09",
  "e89650ca-f46e-4232-93ac-19523d364ea4",
  "3ba66552-5e7e-41d8-ac99-26931655dee5",
  "66f11958-31fa-437b-a12f-88523e5dec9c",
  "bf81c631-d2b4-418a-b898-affb4d84e68f",
]);

const DEDUCTION_CONTEXT = /driver_settlement_deductions|settlement.?deduction|deductions\.(routes|service)|SettlementDeduction/i;

export function check({ mig, materialize, touching }) {
  const f = [];
  if (!/GREATEST\(d\.amount_cents - COALESCE\(a\.applied_cents, 0\), 0\)/.test(mig)) f.push(`${MIG}: the view no longer derives remaining = amount - applied lines`);
  if (!/sl\.line_type = 'deduction'[\s\S]{0,200}sl\.source_reference_id = d\.id[\s\S]{0,200}sl\.voided_at IS NULL/.test(mig)) f.push(`${MIG}: applied lines must be the deduction's own active, unvoided deduction lines`);
  const sel = materialize.slice(materialize.indexOf("// ---- driver_settlement_deductions ----"));
  if (!/FROM driver_finance\.v_settlement_deduction_balances v WHERE v\.deduction_id = d\.id\) AS amount_cents/.test(sel)) {
    f.push(`${MATERIALIZE}: the materializer must deduct the DERIVED remaining (v_settlement_deduction_balances), not the stored column or the full amount`);
  }
  for (const file of touching) if (!COLUMN_DEBT.includes(file)) f.push(`${file}: a NEW reader / writer of remaining_balance_cents — read v_settlement_deduction_balances instead`);
  for (const file of COLUMN_DEBT) if (!touching.includes(file)) f.push(`${file}: no longer touches the column — remove it from COLUMN_DEBT (shrink-only)`);
  return f;
}

export function judge({ overApplied, drifted }) {
  const f = [];
  if (overApplied.length) f.push(`${overApplied.length} deduction(s) applied for MORE than their amount (a driver charged twice): ${overApplied.slice(0, 5).join(", ")}`);
  const fresh = drifted.filter((id) => !DRIFT_DEBT.has(id));
  if (fresh.length) f.push(`${fresh.length} new deduction(s) whose stored balance disagrees with their settlement lines: ${fresh.slice(0, 5).join(", ")}`);
  return f;
}

function touchingFiles() {
  const out = execFileSync("git", ["grep", "-l", "remaining_balance_cents", "--", "apps/backend/src"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean).filter((f) => !/(\.test\.|__tests__)/.test(f));
  return out.filter((f) => DEDUCTION_CONTEXT.test(fs.readFileSync(path.join(ROOT, f), "utf8") + f)).filter((f) => !/bucket-ledger/.test(f));
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const real = { mig: read(MIG), materialize: read(MATERIALIZE), touching: touchingFiles() };
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["materializer back on the full amount", { ...real, materialize: real.materialize.replace("(SELECT v.remaining_cents FROM driver_finance.v_settlement_deduction_balances v WHERE v.deduction_id = d.id) AS amount_cents", "d.amount_cents") }],
    ["view stops subtracting lines", { ...real, mig: real.mig.replace("GREATEST(d.amount_cents - COALESCE(a.applied_cents, 0), 0)", "d.amount_cents") }],
    ["new reader of the column", { ...real, touching: [...real.touching, "apps/backend/src/driver-finance/new-reader.service.ts"] }],
    ["debt not shrunk", { ...real, touching: real.touching.filter((f) => f !== COLUMN_DEBT[0]) }],
  ];
  for (const [name, s] of plants) {
    if (JSON.stringify(s) === JSON.stringify(real)) fails.push(`plant did not change the source: ${name}`);
    else if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (judge({ overApplied: ["x"], drifted: [] }).length !== 1) fails.push("over-application not caught");
  if (judge({ overApplied: [], drifted: [...DRIFT_DEBT] }).length !== 0) fails.push("named drift flagged");
  if (judge({ overApplied: [], drifted: ["new"] }).length !== 1) fails.push("new drift not caught");
  const n = plants.length + 3;
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${n}/${n}`);
  process.exit(0);
}

const fails = check({ mig: read(MIG), materialize: read(MATERIALIZE), touching: touchingFiles() });
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  // Same derivation as the view, inlined so the guard also runs before 202615340800 is applied. UNSCOPED.
  const rows = (await c.query(`
    WITH app AS (
      SELECT sl.source_reference_id AS did, sum(round(abs(sl.amount) * 100))::bigint AS applied
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
       WHERE sl.line_type = 'deduction' AND sl.voided_at IS NULL AND COALESCE(sl.is_active, true) AND s.voided_at IS NULL
       GROUP BY 1)
    SELECT d.id::text, d.amount_cents::bigint AS amount, COALESCE(a.applied, 0)::bigint AS applied,
           COALESCE(d.remaining_balance_cents, d.amount_cents)::bigint AS stored, d.voided_at IS NOT NULL AS voided
      FROM driver_finance.driver_settlement_deductions d
      LEFT JOIN app a ON a.did = d.id`)).rows;
  await c.query("ROLLBACK");
  if (rows.length === 0) { console.error(`${LABEL}: FAIL — 0 deductions read; an empty result is an instrument problem, not a pass`); process.exit(1); }
  const overApplied = rows.filter((r) => Number(r.applied) > Number(r.amount)).map((r) => r.id);
  const drifted = rows.filter((r) => !r.voided && Number(r.stored) !== Math.max(Number(r.amount) - Number(r.applied), 0)).map((r) => r.id);
  const bad = judge({ overApplied, drifted });
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — ${rows.length} deductions (all companies); 0 over-applied; stored drift only on the ${DRIFT_DEBT.size} named purge rows (${drifted.length} now); ${COLUMN_DEBT.length} backend files still to repoint`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
