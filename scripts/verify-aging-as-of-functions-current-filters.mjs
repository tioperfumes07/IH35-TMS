#!/usr/bin/env node
/**
 * ACCT-F5658 (Findings 2+3) — the LAST migration to declare accounting.ar_aging_as_of /
 * accounting.ap_aging_as_of must carry the decided exclusions + dated credit netting.
 *
 * WHY LAST-DECLARATION: migration 202606290040 (applied, frozen) declared both functions with
 * permissive filters; 202612830000 re-declared them corrected. Because CREATE OR REPLACE means the
 * chronologically LAST declaration wins on a fresh DB and on prod alike, this guard finds the last
 * migration file declaring each function and asserts the corrections are present THERE — so a
 * future re-declare that silently drops an exclusion goes RED, while the frozen old file stays
 * untouched and unflagged.
 *
 * Asserted per function (in its last-declaring file):
 *   ar_aging_as_of: status exclusion contains 'void' + 'proforma' + 'draft';
 *                   dated credit_memo_applications netting (voided_at IS NULL + applied_at <= p_as_of).
 *   ap_aging_as_of: a bills status exclusion containing 'void' + 'draft';
 *                   dated vendor_credit_applications netting.
 *
 * Run:  node scripts/verify-aging-as-of-functions-current-filters.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-aging-as-of-functions-current-filters";
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");

function lastDeclaringFile(files, fnName) {
  let last = null;
  for (const f of files) {
    if (f.text.includes(`CREATE OR REPLACE FUNCTION accounting.${fnName}(`)) last = f;
  }
  return last;
}

export function analyze(files) {
  const failures = [];

  const ar = lastDeclaringFile(files, "ar_aging_as_of");
  if (!ar) {
    failures.push("no migration declares accounting.ar_aging_as_of — structure changed, re-check this guard");
  } else {
    const tuple = /i\.status NOT IN \(([^)]*)\)/.exec(ar.text)?.[1] ?? "";
    for (const required of ["void", "proforma", "draft"]) {
      if (!new RegExp(`'${required}'`).test(tuple)) {
        failures.push(
          `${ar.name}: the LAST declaration of ar_aging_as_of is missing '${required}' from its status ` +
            `exclusion — the historical A/R aging path would count that class again (ACCT-F5658; ` +
            `proformas alone were $22,720.00 of invented receivables on USMCA).`
        );
      }
    }
    if (!/credit_memo_applications[\s\S]{0,400}voided_at IS NULL[\s\S]{0,200}applied_at[\s\S]{0,80}<= p_as_of/.test(ar.text)) {
      failures.push(
        `${ar.name}: the LAST declaration of ar_aging_as_of does not net dated, non-voided ` +
          `credit_memo_applications — an applied AR credit memo would not reduce the historical ` +
          `statement (ACCT-F5612/ACCT-F5658).`
      );
    }
  }

  const ap = lastDeclaringFile(files, "ap_aging_as_of");
  if (!ap) {
    failures.push("no migration declares accounting.ap_aging_as_of — structure changed, re-check this guard");
  } else {
    const tuple = /b\.status NOT IN \(([^)]*)\)/.exec(ap.text)?.[1] ?? "";
    for (const required of ["void", "draft"]) {
      if (!new RegExp(`'${required}'`).test(tuple)) {
        failures.push(
          `${ap.name}: the LAST declaration of ap_aging_as_of is missing '${required}' from its bills ` +
            `status exclusion — a ${required} bill would report as money owed to a vendor (ACCT-F5658).`
        );
      }
    }
    if (!/vendor_credit_applications[\s\S]{0,400}voided_at IS NULL[\s\S]{0,200}applied_at[\s\S]{0,80}<= p_as_of/.test(ap.text)) {
      failures.push(
        `${ap.name}: the LAST declaration of ap_aging_as_of does not net dated, non-voided ` +
          `vendor_credit_applications (ACCT-F5658).`
      );
    }
  }

  return failures;
}

export function run() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((name) => ({ name: `db/migrations/${name}`, text: fs.readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") }));
  return analyze(files);
}

if (process.argv.includes("--selftest")) {
  const OLD_PERMISSIVE = {
    name: "db/migrations/0001_old.sql",
    text: `
CREATE OR REPLACE FUNCTION accounting.ar_aging_as_of(p_opco uuid, p_as_of date) RETURNS TABLE (x int) AS $$
  SELECT 1 FROM accounting.invoices i WHERE i.status NOT IN ('draft', 'factored')
$$;
CREATE OR REPLACE FUNCTION accounting.ap_aging_as_of(p_opco uuid, p_as_of date) RETURNS TABLE (x int) AS $$
  SELECT 1 FROM accounting.bills b WHERE b.bill_date <= p_as_of
$$;`,
  };
  const NEW_CORRECT = {
    name: "db/migrations/0002_new.sql",
    text: `
CREATE OR REPLACE FUNCTION accounting.ar_aging_as_of(p_opco uuid, p_as_of date) RETURNS TABLE (x int) AS $$
  SELECT 1 FROM accounting.invoices i
  WHERE i.status NOT IN ('draft', 'factored', 'void', 'voided', 'proforma')
    AND 0 < (SELECT SUM(cma.applied_cents) FROM accounting.credit_memo_applications cma
             WHERE cma.voided_at IS NULL AND (cma.applied_at AT TIME ZONE 'UTC')::date <= p_as_of)
$$;
CREATE OR REPLACE FUNCTION accounting.ap_aging_as_of(p_opco uuid, p_as_of date) RETURNS TABLE (x int) AS $$
  SELECT 1 FROM accounting.bills b
  WHERE b.status NOT IN ('void', 'voided', 'draft')
    AND 0 < (SELECT SUM(vca.applied_cents) FROM accounting.vendor_credit_applications vca
             WHERE vca.voided_at IS NULL AND (vca.applied_at AT TIME ZONE 'UTC')::date <= p_as_of)
$$;`,
  };

  // Corrected declaration LAST → green (the frozen permissive file earlier in the chain is fine).
  if (analyze([OLD_PERMISSIVE, NEW_CORRECT]).length !== 0) {
    throw new Error(`[${LABEL}] selftest PASS fixture FAILED: ${analyze([OLD_PERMISSIVE, NEW_CORRECT]).join("; ")}`);
  }
  // Permissive declaration LAST (a future regression re-declare) → red, multiple failures.
  const regressed = analyze([NEW_CORRECT, OLD_PERMISSIVE]);
  if (regressed.length < 3) {
    throw new Error(`[${LABEL}] selftest REGRESSION fixture (permissive re-declare wins) should FAIL >=3 checks, got ${regressed.length}`);
  }
  console.log(`[${LABEL}] selftest: PASS — corrected-last green, permissive-last red`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — the last declarations of ar/ap_aging_as_of carry the decided status exclusions and dated credit netting`);
