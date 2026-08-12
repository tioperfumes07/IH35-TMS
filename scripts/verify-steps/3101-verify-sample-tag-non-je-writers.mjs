#!/usr/bin/env node
/**
 * ACCT-F353 — sample-tag writer sweep, non-JE tables.
 *
 * `is_sample_data` exists on all 7 money tables the SAMPLE-TAG-MONEY-TABLES-MISSING board row named,
 * but guard 2817 only ever covered `driver_finance.driver_settlements`. Census (2026-08-11) found
 * ~14 writers across `accounting.{invoices,payments,bill_payments,expenses}` — plus, discovered while
 * fixing them, several `accounting.bills` writers beyond `createBill()` — that never referenced the
 * column at all. Every one of those money documents was structurally opted OUT of the sample-data tag
 * by omission, exactly the failure class `LV-SAMPLE-TAG-DISPATCH-HOLE` already burned once (a real
 * column, a green guard, and a writer nobody pointed the guard at).
 *
 * FIX: each writer below now derives `is_sample_data` from the most correct available parent —
 * the vendor being billed/paid, the customer being invoiced, or the load a document is generated
 * from — falling back to explicit `false` only where no parent carries the flag at all.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): for each
 * (file, table) pair below, the file's OWN `INSERT INTO <table> (...)` column-list(s) reference
 * `is_sample_data`. Journal_entries writers are OUT OF SCOPE for this guard — they are the highest-
 * risk surface (the actual GL ledger) and are tracked as a separate, later pass; this guard existing
 * for the non-JE tables does not imply JE writers are covered.
 *
 * Self-test: node scripts/verify-steps/3101-verify-sample-tag-non-je-writers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "3101-verify-sample-tag-non-je-writers";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

const WRITERS = [
  // NOTE: bills.service.ts's createBill() is deliberately NOT in this list — it wires is_sample_data
  // via an UPDATE-after-INSERT (ACCT-F262/F603, already on main), not a column in the INSERT list
  // this guard's static check looks for. That pattern is correct; this guard just can't see it.
  { file: "apps/backend/src/accounting/recurring.worker.ts", table: "accounting.bills" },
  { file: "apps/backend/src/accounting/recurring.worker.ts", table: "accounting.invoices" },
  { file: "apps/backend/src/accounting/recurring.worker.ts", table: "accounting.expenses" },
  { file: "apps/backend/src/accounting/maintenance-posting/poster.service.ts", table: "accounting.bills" },
  { file: "apps/backend/src/banking/bulk-transactions.ts", table: "accounting.bills" },
  { file: "apps/backend/src/banking/bulk-transactions.ts", table: "accounting.bill_payments" },
  { file: "apps/backend/src/banking/bank-transaction-splits.service.ts", table: "accounting.bills" },
  { file: "apps/backend/src/banking/bank-transaction-splits.service.ts", table: "accounting.bill_payments" },
  { file: "apps/backend/src/maintenance/two-section-service.ts", table: "accounting.bills" },
  { file: "apps/backend/src/maintenance/two-section-service.ts", table: "accounting.expenses" },
  { file: "apps/backend/src/insurance/policy-create-atomic.service.ts", table: "accounting.bills" },
  { file: "apps/backend/src/accounting/payments.routes.ts", table: "accounting.payments" },
  { file: "apps/backend/src/ap/payment-application.routes.ts", table: "accounting.bill_payments" },
  { file: "apps/backend/src/cash-advances/lumper-cash-advance-split.ts", table: "accounting.bill_payments" },
  { file: "apps/backend/src/cash-advances/lumper-cash-advance-split.ts", table: "accounting.expenses" },
  { file: "apps/backend/src/bill-payments/cc-payment.routes.ts", table: "accounting.bill_payments" },
  { file: "apps/backend/src/accounting/invoices.routes.ts", table: "accounting.invoices" },
  { file: "apps/backend/src/accounting/invoices.service.ts", table: "accounting.invoices" },
  { file: "apps/backend/src/factoring/packet-assemble.service.ts", table: "accounting.invoices" },
];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

/** Isolate every `INSERT INTO <table> ( ... )` column-list in a file for the given table name. */
export function findInsertColumnLists(src, table) {
  const code = stripComments(src);
  const lists = [];
  const anchor = new RegExp(`INSERT INTO ${table.replace(".", "\\.")}\\s*\\(`, "g");
  let m;
  while ((m = anchor.exec(code))) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < code.length && depth > 0) {
      if (code[i] === "(") depth += 1;
      else if (code[i] === ")") depth -= 1;
      i += 1;
    }
    lists.push(code.slice(start, i - 1));
  }
  return lists;
}

export function checkWriter(src, table) {
  const lists = findInsertColumnLists(src, table);
  if (lists.length === 0) return { ok: false, reason: `no INSERT INTO ${table} found` };
  const missing = lists.filter((l) => !/is_sample_data/.test(l));
  if (missing.length > 0) {
    return { ok: false, reason: `${missing.length} of ${lists.length} ${table} INSERT(s) missing is_sample_data` };
  }
  return { ok: true };
}

if (process.argv.includes("--selftest")) {
  const good = `await client.query(\`INSERT INTO accounting.bills (operating_company_id, vendor_id, is_sample_data) VALUES ($1,$2,$3)\`)`;
  const bad = `await client.query(\`INSERT INTO accounting.bills (operating_company_id, vendor_id) VALUES ($1,$2)\`)`;
  const commentTrap = `// INSERT INTO accounting.bills (is_sample_data) fake\nawait client.query(\`INSERT INTO accounting.bills (operating_company_id) VALUES ($1)\`)`;

  const g = checkWriter(good, "accounting.bills");
  if (!g.ok) fail(`selftest: good fixture flagged — ${g.reason}`);
  const b = checkWriter(bad, "accounting.bills");
  if (b.ok) fail("selftest: bad fixture (is_sample_data stripped) was not caught — invariant is inert");
  const c = checkWriter(commentTrap, "accounting.bills");
  if (c.ok) fail("selftest: a mention of is_sample_data in a COMMENT satisfied the check — comment-matching trap");

  // Real-file regression check: each of the writer/table pairs must currently pass.
  for (const w of WRITERS) {
    const src = fs.readFileSync(path.join(ROOT, w.file), "utf8");
    const r = checkWriter(src, w.table);
    if (!r.ok) fail(`selftest baseline: real writer ${w.file} (${w.table}) should pass but does not — ${r.reason}`);
  }

  console.log(`[${LABEL}] selftest: PASS — fixtures classify correctly; all ${WRITERS.length} real writer/table pairs pass`);
  process.exit(0);
}

const failures = [];
for (const w of WRITERS) {
  const p = path.join(ROOT, w.file);
  if (!fs.existsSync(p)) {
    failures.push(`${w.file}: file not found`);
    continue;
  }
  const src = fs.readFileSync(p, "utf8");
  const r = checkWriter(src, w.table);
  if (!r.ok) failures.push(`${w.file} (${w.table}): ${r.reason}`);
}

if (failures.length) {
  console.error(`[${LABEL}] FAIL — ${failures.length} of ${WRITERS.length} writer/table pair(s) regressed:`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — all ${WRITERS.length} non-JE sample-tag writer/table pairs bind is_sample_data`);
