#!/usr/bin/env node
/**
 * FINDING: LV-CUSTOMERS-OPEN-BALANCE-INCLUDES-VOIDED (carries ACCT-F5398) — found live 2026-08-16
 * while performing the assigned accounting Wave A3 live-verify of the `customers` leaf. USMCA's
 * Customers list "Open Balance" column summed to exactly the same wrong total ($34,873.57) already
 * fixed on the Accounting Home KPI (ACCT-F5395) — a THIRD surface with the identical bug.
 *
 * ROOT CAUSE: `openByCustomerId` in apps/frontend/src/pages/Customers.tsx summed
 * `invoice.amount_open_cents` for every invoice by customer_id, without excluding voided invoices.
 * amount_open_cents is a STORED GENERATED column (total_cents - amount_paid_cents) that legitimately
 * stays nonzero after a void (ACCT-F200) — every open-A/R read path must exclude voided rows via
 * isVoidInvoice/invoiceOpenCentsForDisplay (already exported from InvoicesListPage.tsx and already
 * used to fix ACCT-F5395's AccountingHubPage.tsx surface). Live-measured: pre-fix, 5 USMCA customers
 * showed a combined $34,873.57 "open" (Semares $19,130 / TC Freight $5,300 / TIO PERFUMES $2,208.57 /
 * ZZ-SAMPLE A $5,835 / ZZ-SAMPLE B $2,400) — all inflated by their voided invoices' generated-column
 * remainder. The correct total (confirmed via the same live SQL, excluding void) is $3,200.00 across
 * only 2 customers.
 *
 * FIX: openByCustomerId and the master-detail transaction-list Balance column now filter through
 * isVoidInvoice + invoiceOpenCentsForDisplay, same as AccountingHubPage.tsx's ACCT-F5395 fix.
 *
 * Static check (always runs): Customers.tsx imports both helpers from ./accounting/InvoicesListPage
 * and both the openByCustomerId loop and transaction-list Balance cell use the canonical helper —
 * neither may regress to a bare amount_open_cents read.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customers-open-balance-excludes-void";
const TARGET_REL = "apps/frontend/src/pages/Customers.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertOpenByCustomerExcludesVoid(source) {
  const errors = [];
  const importsHelpers =
    /import\s*\{[^}]*invoiceOpenCentsForDisplay[^}]*\}\s*from\s*["']\.\/accounting\/InvoicesListPage["']/.test(source) &&
    /import\s*\{[^}]*isVoidInvoice[^}]*\}\s*from\s*["']\.\/accounting\/InvoicesListPage["']/.test(source);
  if (!importsHelpers) {
    errors.push("does not import isVoidInvoice + invoiceOpenCentsForDisplay from ./accounting/InvoicesListPage");
  }

  const loopMatch = source.match(/const openByCustomerId = useMemo\(\(\) => \{([\s\S]*?)\n  \}, \[allInvoicesQuery\.data\?\.invoices\]\);/);
  if (!loopMatch) {
    errors.push("openByCustomerId useMemo block not found (renamed/removed?)");
  } else {
    const body = loopMatch[1];
    if (!body.includes("isVoidInvoice")) {
      errors.push("openByCustomerId loop regressed to not check isVoidInvoice");
    }
    if (!body.includes("invoiceOpenCentsForDisplay")) {
      errors.push("openByCustomerId loop regressed to not use invoiceOpenCentsForDisplay");
    }
    if (/current \+ Number\(invoice\.amount_open_cents/.test(body)) {
      errors.push("openByCustomerId loop regressed to a bare amount_open_cents sum (includes voided rows)");
    }
  }

  if (!/key:\s*["']balance["'][^\n]*render:\s*\(r\)\s*=>\s*fmtMoney\(invoiceOpenCentsForDisplay\(r\)\)/.test(source)) {
    errors.push("customer transaction-list Balance must use invoiceOpenCentsForDisplay(r)");
  }

  if (/key:\s*["']balance["'][^\n]*render:\s*\(r\)\s*=>\s*fmtMoney\(r\.amount_open_cents\)/.test(source)) {
    errors.push("customer transaction-list Balance regressed to raw amount_open_cents (voids display as open)");
  }

  return errors;
}

function selftest() {
  const problems = [];
  const live = read(TARGET_REL);

  const liveErrors = assertOpenByCustomerExcludesVoid(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "import removed",
      live.replace(
        'import { invoiceOpenCentsForDisplay, isVoidInvoice } from "./accounting/InvoicesListPage";\n',
        ""
      ),
      "does not import isVoidInvoice",
    ],
    [
      "loop reverted to bare amount_open_cents sum",
      live.replace(
        /if \(isVoidInvoice\(invoice\)\) continue;\n(\s*)const current = map\.get\(invoice\.customer_id\) \?\? 0;\n\s*map\.set\(invoice\.customer_id, current \+ invoiceOpenCentsForDisplay\(invoice\)\);/,
        "$1const current = map.get(invoice.customer_id) ?? 0;\n$1    map.set(invoice.customer_id, current + Number(invoice.amount_open_cents ?? 0));"
      ),
      "bare amount_open_cents sum",
    ],
    [
      "transaction-list Balance reverted to raw amount_open_cents",
      live.replace(
        "{ key: \"balance\", label: \"Balance\", render: (r) => fmtMoney(invoiceOpenCentsForDisplay(r)) },",
        "{ key: \"balance\", label: \"Balance\", render: (r) => fmtMoney(r.amount_open_cents) },"
      ),
      "transaction-list Balance",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertOpenByCustomerExcludesVoid(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertOpenByCustomerExcludesVoid(read(TARGET_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}

main();
