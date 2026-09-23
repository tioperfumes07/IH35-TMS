#!/usr/bin/env node
// Round 83 R3 / Lead cross to Cursor (item + line schema, migration 202614271200): every money line is
// item · QTY · RATE · AMOUNT, amount = qty x rate, never typed. Static, no DATABASE_URL:
//   1. the migration still declares the four computed-amount CHECKs (NOT VALID until the purge is
//      validated) and the three same-company item FKs, with rate in fractional cents;
//   2. no invoice-line writer computes line_total_cents with a floating Math.round(quantity * unit),
//      which disagrees with the CHECK on exact halves (0.29 x 50 = 14.4999... -> 14; the row says 15).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-item-line-quantity-rate-amount";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = process.env.ITEM_LINE_MIGRATION_PATH || path.join(ROOT, "db/migrations/202614271200_item_line_quantity_rate_amount.sql");
const WRITERS = ["apps/backend/src/accounting/invoice-lines.routes.ts", "apps/backend/src/accounting/recurring.worker.ts"];

const CHECKS = [
  ["bill_lines_item_qty_rate_amount_check", "round(quantity * rate_cents) = round(amount * 100)"],
  ["expense_lines_item_qty_rate_amount_check", "round(quantity * rate_cents) = amount_cents"],
  ["settlement_lines_item_qty_rate_amount_check", "round(quantity * rate_cents) = round(amount * 100)"],
  ["invoice_lines_qty_rate_amount_check", "line_total_cents = round(quantity * unit_amount_cents)"],
];
const FKS = ["bill_lines_item_same_company_fkey", "expense_lines_item_same_company_fkey", "settlement_lines_item_same_company_fkey"];
const FLOAT_TOTAL_RE = /Math\.round\(\s*[\w.]*quantity[\w.]*\s*\*|Math\.round\(\s*qty\s*\*/;

export function migrationFailures(sql) {
  const failures = [];
  const flat = sql.replace(/\s+/g, " ");
  for (const [name, rule] of CHECKS) {
    const at = flat.indexOf(`ADD CONSTRAINT ${name} CHECK`);
    if (at === -1) {
      failures.push(`${name} is not declared`);
      continue;
    }
    const body = flat.slice(at, flat.indexOf(";", at));
    if (!body.includes(rule)) failures.push(`${name} no longer computes ${rule}`);
    if (!/\)\s*NOT VALID$/.test(body.trim())) failures.push(`${name} must be NOT VALID until the purge is validated`);
  }
  for (const fk of FKS) {
    if (!new RegExp(`ADD CONSTRAINT ${fk} FOREIGN KEY \\(operating_company_id, item_id\\) REFERENCES catalogs\\.items \\(operating_company_id, id\\)`).test(flat)) {
      failures.push(`${fk} is not a same-company FK to catalogs.items`);
    }
  }
  if ((flat.match(/rate_cents numeric\(14,4\)/g) ?? []).length !== 3) failures.push("rate_cents must be numeric(14,4) on all three new line columns (fractional cents)");
  return failures;
}

export function writerFailures(file, src) {
  return FLOAT_TOTAL_RE.test(src) ? [`${file} computes a line total with floating Math.round(quantity * unit); use invoiceLineTotalCents`] : [];
}

function selftest() {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const check = (cond, msg) => {
    if (!cond) {
      console.error(`${LABEL} --selftest FAIL: ${msg}`);
      process.exit(1);
    }
  };
  check(migrationFailures(sql).length === 0, "the real migration must pass");
  check(migrationFailures(sql.replace("round(quantity * rate_cents) = amount_cents", "true")).length === 1, "a CHECK that no longer computes must fail");
  check(migrationFailures(sql.replace(/\) NOT VALID;\n  END IF;\n  CREATE INDEX IF NOT EXISTS idx_bill_lines/, ");\n  END IF;\n  CREATE INDEX IF NOT EXISTS idx_bill_lines")).length === 1, "a validated CHECK must fail");
  check(migrationFailures(sql.replace("REFERENCES catalogs.items (operating_company_id, id);\n  END IF;\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint WHERE conname = 'bill_lines_item_qty", "REFERENCES catalogs.items (id);\n  END IF;\n  IF NOT EXISTS (\n    SELECT 1 FROM pg_constraint WHERE conname = 'bill_lines_item_qty")).length === 1, "a cross-company FK must fail");
  check(writerFailures("x.ts", "const lineTotal = Math.round(body.data.quantity * body.data.unit_amount_cents);").length === 1, "a float writer must fail");
  check(writerFailures("x.ts", "const lineTotal = invoiceLineTotalCents(qty, unit);").length === 0, "the exact helper must pass");
  console.log(`${LABEL} --selftest PASS — 6 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = [...migrationFailures(fs.readFileSync(MIGRATION, "utf8"))];
for (const w of WRITERS) failures.push(...writerFailures(w, fs.readFileSync(path.join(ROOT, w), "utf8")));
if (failures.length > 0) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — 4 computed-amount CHECKs (NOT VALID), 3 same-company item FKs, fractional-cent rates; ${WRITERS.length} invoice writers use invoiceLineTotalCents.`);
