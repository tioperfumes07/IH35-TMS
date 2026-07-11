#!/usr/bin/env node
// verify-detention-invoice-fk (P3-INVOICE-FK residual)
// Asserts migration 202607210000 enforces the detention -> invoice linkage: dispatch.detention_requests
// .invoice_id -> accounting.invoices and .invoice_line_id -> accounting.invoice_lines (both canonical,
// NOT RETIRE), added idempotently. Guards against the FK being weakened/removed. Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607210000_detention_requests_invoice_fk.sql";

function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }

export function check(sql) {
  const failures = [];
  if (!/FOREIGN\s+KEY\s*\(\s*invoice_id\s*\)\s*REFERENCES\s+accounting\.invoices\s*\(\s*id\s*\)/i.test(sql)) {
    failures.push("must add FK detention_requests.invoice_id -> accounting.invoices(id)");
  }
  if (!/FOREIGN\s+KEY\s*\(\s*invoice_line_id\s*\)\s*REFERENCES\s+accounting\.invoice_lines\s*\(\s*id\s*\)/i.test(sql)) {
    failures.push("must add FK detention_requests.invoice_line_id -> accounting.invoice_lines(id)");
  }
  if (!/NOT\s+VALID/i.test(sql)) {
    failures.push("FKs must be added NOT VALID (safe against pre-existing orphans; GUARD VALIDATEs on Neon)");
  }
  if (!/pg_constraint/i.test(sql)) {
    failures.push("must be idempotent (guard on pg_constraint before ADD CONSTRAINT)");
  }
  return failures;
}

export function run() {
  let sql;
  try { sql = read(MIG); } catch { return [`${MIG} not found`]; }
  return check(sql);
}

if (process.argv.includes("--selftest")) {
  const good = `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='x') THEN ALTER TABLE dispatch.detention_requests ADD CONSTRAINT x FOREIGN KEY (invoice_id) REFERENCES accounting.invoices(id) NOT VALID; END IF; IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='y') THEN ALTER TABLE dispatch.detention_requests ADD CONSTRAINT y FOREIGN KEY (invoice_line_id) REFERENCES accounting.invoice_lines(id) NOT VALID; END IF; END $$;`;
  const noNotValid = good.replace(/NOT VALID/g, "");
  const checks = [
    ["both FKs + NOT VALID + idempotent passes", check(good).length === 0],
    ["missing NOT VALID is caught", check(noNotValid).some((f) => /NOT VALID/.test(f))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:detention-invoice-fk --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:detention-invoice-fk --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:detention-invoice-fk FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:detention-invoice-fk PASS (detention -> invoice/line FKs present, NOT VALID, idempotent)");
}
