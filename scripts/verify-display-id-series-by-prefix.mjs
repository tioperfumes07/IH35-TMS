#!/usr/bin/env node
// E9 (Lead register, display_id). Every yearly document-number series in
// apps/backend/src/accounting/display-id.ts must:
//   1. find its MAX by the series PREFIX only. A date window (issue_date / bill_date / payment_date /
//      transaction_date / submitted_at) misses a number whose document date sits in another year and
//      re-issues it, and the per-company unique constraint then refuses the owner's create;
//   2. take the per-company advisory lock, the same key its resolve* manual path takes (no :${year});
//   3. for invoices and payments (full per-company unique constraints that include voided rows): never
//      exclude voided rows from a "number taken" check, in display-id.ts or in the routes' ?check= preview.
// Static source scan. --selftest plants each regression and requires a failure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-display-id-series-by-prefix";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  allocator: "apps/backend/src/accounting/display-id.ts",
  invoiceRoutes: "apps/backend/src/accounting/invoices.routes.ts",
  paymentRoutes: "apps/backend/src/accounting/payments.routes.ts",
};
const SERIES = [
  "nextInvoiceDisplayId",
  "nextPaymentDisplayId",
  "nextCreditMemoDisplayId",
  "nextBillDisplayId",
  "nextVendorCreditDisplayId",
  "nextFactoringDisplayId",
  "nextExpenseDisplayId",
];
const FULL_UNIQUE_RESOLVERS = [
  ["resolveInvoiceDisplayId", "accounting.invoices"],
  ["resolvePaymentDisplayId", "accounting.payments"],
];

const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function fnBody(src, name) {
  const start = src.search(new RegExp(`export async function ${name}\\s*\\(`));
  if (start < 0) return null;
  const end = src.indexOf("\n}\n", start);
  return src.slice(start, end < 0 ? undefined : end + 2);
}

export function check(read) {
  const failures = [];
  const alloc = read(FILES.allocator);
  if (alloc == null) return [`missing ${FILES.allocator}`];
  const code = stripComments(alloc);

  for (const name of SERIES) {
    const body = fnBody(code, name);
    if (!body) {
      failures.push(`${name} not found in ${FILES.allocator}`);
      continue;
    }
    if (/make_date|_date\s*>=|_date\s*<|submitted_at\s*>=|submitted_at\s*</.test(body)) {
      failures.push(`${name}: the MAX is bounded by a document-date window; scan the series by its prefix only`);
    }
    if (!/LIKE \$2 \|\| '%'/.test(body)) failures.push(`${name}: the MAX is not filtered by the series prefix ($2)`);
    if (!/operating_company_id = \$1::uuid/.test(body)) failures.push(`${name}: the MAX is not scoped to the company`);
    if (/right\(\w+,\s*\d\)::int/.test(body)) failures.push(`${name}: fixed-width right(...)::int stops counting past the padding width`);
    const locks = [...body.matchAll(/withDisplayLock\(client,\s*`([^`]*)`\)/g)].map((m) => m[1]);
    if (locks.length !== 1) failures.push(`${name}: expected exactly one advisory lock, found ${locks.length}`);
    else if (/\$\{year\}/.test(locks[0]) || !/:\$\{operatingCompanyId\}$/.test(locks[0])) {
      failures.push(`${name}: lock key "${locks[0]}" is not the per-company key its manual path takes`);
    }
  }

  for (const [name, table] of FULL_UNIQUE_RESOLVERS) {
    const body = fnBody(code, name);
    if (!body) {
      failures.push(`${name} not found in ${FILES.allocator}`);
      continue;
    }
    const takenChecks = [...body.matchAll(/SELECT 1[\s\S]*?LIMIT 1/g)].map((m) => m[0]).filter((q) => q.includes(table));
    if (takenChecks.length === 0) failures.push(`${name}: no "number taken" check on ${table}`);
    for (const q of takenChecks) {
      if (/voided_at/.test(q)) failures.push(`${name}: the taken-check on ${table} excludes voided rows; the unique constraint does not`);
    }
  }

  for (const [key, table] of [["invoiceRoutes", "accounting.invoices"], ["paymentRoutes", "accounting.payments"]]) {
    const src = read(FILES[key]);
    if (src == null) {
      failures.push(`missing ${FILES[key]}`);
      continue;
    }
    for (const m of src.matchAll(/`SELECT 1 FROM ([\w.]+) WHERE [^`]*display_id = \$2[^`]*`/g)) {
      if (m[1] === table && /voided_at/.test(m[0])) {
        failures.push(`${FILES[key]}: the ?check= preview says a voided ${table} number is free; the unique constraint refuses it`);
      }
    }
  }
  return failures;
}

const readFromRoot = (rel) => {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
};

if (process.argv.includes("--selftest")) {
  const real = Object.fromEntries(Object.values(FILES).map((rel) => [rel, readFromRoot(rel)]));
  const plants = [
    ["date window back on the invoice MAX", FILES.allocator, (s) => s.replace("AND display_id LIKE $2 || '%'", "AND issue_date >= make_date($3, 1, 1)")],
    ["per-year lock key on bills", FILES.allocator, (s) => s.replace("`accounting.bill.display_id:${operatingCompanyId}`);\n  const res", "`accounting.bill.display_id:${operatingCompanyId}:${year}`);\n  const res")],
    ["voided filter back on the manual invoice check", FILES.allocator, (s) => s.replace(/(FROM accounting\.invoices\n\s*WHERE operating_company_id = \$1::uuid\n\s*AND display_id = \$2\n)(\s*LIMIT 1)/, "$1           AND voided_at IS NULL\n$2")],
    ["voided filter back on the payments ?check= preview", FILES.paymentRoutes, (s) => s.replace("FROM accounting.payments WHERE operating_company_id = $1::uuid AND display_id = $2 LIMIT 1", "FROM accounting.payments WHERE operating_company_id = $1::uuid AND display_id = $2 AND voided_at IS NULL LIMIT 1")],
  ];
  const clean = check((rel) => real[rel]);
  if (clean.length) {
    console.error(`${LABEL} --selftest FAIL: the real tree is not clean:\n  - ${clean.join("\n  - ")}`);
    process.exit(1);
  }
  for (const [what, file, mutate] of plants) {
    const mutated = mutate(real[file]);
    if (mutated === real[file]) {
      console.error(`${LABEL} --selftest FAIL: plant "${what}" did not apply`);
      process.exit(1);
    }
    const got = check((rel) => (rel === file ? mutated : real[rel]));
    if (got.length === 0) {
      console.error(`${LABEL} --selftest FAIL: plant "${what}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${plants.length} planted regressions each caught; real tree clean`);
  process.exit(0);
}

const failures = check(readFromRoot);
if (failures.length) {
  console.error(`${LABEL}: FAIL\n  - ${failures.join("\n  - ")}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — ${SERIES.length} series scanned by prefix under a per-company lock; invoice and payment taken-checks (allocator and ?check= preview) count voided numbers as taken.`,
);
