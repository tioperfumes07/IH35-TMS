#!/usr/bin/env node
// CC-2, fuel cost posting chain (owner law 2026-10-01, root fix). A document that carries a journal
// entry is posted in the GL; posting_status='unposted' on it lets the expense void route skip the
// reversal (it reverses only 'posted') and leaves the entry live under a voided document.
// Measured 2026-10-01: 94 USMCA rows (5 fuel documents + 89 settlement-feed), repaired by AUTH-188.
//
// --selftest (static): the CHECK constraint migration exists with the exact predicate and a
//   data-safe conditional VALIDATE; createExpenseFromFuelTransaction writes posting_status from the
//   adopted journal entry. live: zero violators in every company, and once the constraint is on this
//   database it must be VALIDATED (NOT VALID means old rows are unchecked).
import pg from "pg";
import { readFileSync } from "node:fs";

const LABEL = "verify-expense-with-je-is-never-unposted";
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

function selftest() {
  const problems = [];
  const mig = read("db/migrations/202615140700_expenses_journal_entry_implies_not_unposted.sql");
  if (!/CHECK \(journal_entry_id IS NULL OR posting_status <> 'unposted'\) NOT VALID/.test(mig)) problems.push("migration must add the exact CHECK, NOT VALID");
  if (!/VALIDATE CONSTRAINT expenses_journal_entry_implies_not_unposted/.test(mig) || !/RAISE NOTICE/.test(mig)) problems.push("VALIDATE must be conditional (NOTICE, never an aborting RAISE on data)");
  const w = read("apps/backend/src/fuel/fuel-expense-document.service.ts");
  if (!/CASE WHEN \$10::uuid IS NULL THEN 'unposted' ELSE 'posted' END/.test(w)) problems.push("createExpenseFromFuelTransaction must write posting_status from the adopted journal entry");
  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (3/3)`);
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  // FORCED RLS: read with the same posture as every live guard, or a masked zero passes.
  const hasOwner = (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner'`)).rows.length > 0;
  if (hasOwner) await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const control = (await client.query(`SELECT count(*)::int n FROM accounting.expenses WHERE journal_entry_id IS NOT NULL`)).rows[0].n;
  const bad = await client.query(
    `SELECT operating_company_id::text co, count(*)::int n, sum(total_amount_cents)::bigint cents
       FROM accounting.expenses WHERE journal_entry_id IS NOT NULL AND posting_status = 'unposted' GROUP BY 1`
  );
  const con = (await client.query(
    `SELECT convalidated FROM pg_constraint WHERE conrelid = 'accounting.expenses'::regclass AND conname = 'expenses_journal_entry_implies_not_unposted'`
  )).rows[0];
  await client.query("ROLLBACK");
  const problems = bad.rows.map((r) => `${r.n} expense(s) in ${r.co} carry a journal entry but read unposted ($${(Number(r.cents) / 100).toFixed(2)})`);
  if (con && !con.convalidated) problems.push("constraint expenses_journal_entry_implies_not_unposted is NOT VALID on this database");
  if (problems.length) {
    console.error(`${LABEL}: FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: LIVE PASS — ${control} expense(s) carry a journal entry (positive control), 0 read unposted; constraint ${con ? "VALIDATED" : "not on this database yet (lands with the next deploy)"}.`
  );
} finally {
  await client.end();
}
