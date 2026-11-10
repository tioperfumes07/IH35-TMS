#!/usr/bin/env node
/**
 * A-21 (2026-09-30, owner): "has transactions" must be ONE predicate that both the Customers list
 * and Vendors list endpoints call — never two hand-rolled copies that can silently drift apart.
 * Full derivation + live USMCA proof:
 * docs/bus/2026-09-30-CC1-A13-A14-A16-DRIVER-PROFILE-AND-HAS-TRANSACTIONS-ANALYSIS.md
 *
 * This guard asserts:
 *   1. The shared module exports customerHasTransactionsSql + vendorHasTransactionsSql.
 *   2. mdata/customers.routes.ts imports and calls customerHasTransactionsSql (never a duplicate
 *      inline EXISTS block).
 *   3. mdata/vendors.routes.ts imports and calls vendorHasTransactionsSql (same).
 *   4. The vendor predicate casts vendor_credits.vendor_id — NOT vendor_uuid (the real bug this
 *      exact wording fixed in the A-16 doc: vendor_credits has no vendor_uuid column and a query
 *      referencing it throws at runtime instead of returning a false result).
 *   5. Both predicates scope each EXISTS source by operating_company_id (batch82 fix 2026-11-10 —
 *      the inner tables are RLS-protected; without an explicit company predicate the query returns
 *      0 rows whenever the connection GUC is not set, as measured live on USMCA prod).
 *
 * Self-test: node scripts/verify-has-transactions-predicate-shared.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-has-transactions-predicate-shared";
const SHARED = "apps/backend/src/accounting/has-transactions-predicate.ts";
const CUSTOMERS_ROUTE = "apps/backend/src/mdata/customers.routes.ts";
const VENDORS_ROUTE = "apps/backend/src/mdata/vendors.routes.ts";

const CHECKS = [
  {
    name: "shared module exports customerHasTransactionsSql",
    file: SHARED,
    pattern: /export function customerHasTransactionsSql\(/,
  },
  {
    name: "shared module exports vendorHasTransactionsSql",
    file: SHARED,
    pattern: /export function vendorHasTransactionsSql\(/,
  },
  {
    name: "customer predicate excludes proforma AND voided invoices (r294d owner overrule)",
    file: SHARED,
    pattern: /i\.status NOT IN \('proforma', 'void'\)/,
  },
  {
    name: "vendor predicate excludes voided bills but casts vendor_uuid correctly",
    file: SHARED,
    pattern: /b\.vendor_uuid = \$\{idExpr\}::text AND b\.status != 'void'/,
  },
  {
    name: "vendor predicate excludes voided expenses",
    file: SHARED,
    pattern: /e\.vendor_uuid = \$\{idExpr\} AND e\.voided_at IS NULL/,
  },
  {
    name: "vendor predicate excludes voided fuel transactions",
    file: SHARED,
    pattern: /f\.vendor_id = \$\{idExpr\} AND f\.voided_at IS NULL/,
  },
  {
    name: "vendor predicate casts vendor_credits.vendor_id (not the nonexistent vendor_uuid)",
    file: SHARED,
    pattern: /vc\.vendor_id::text = \$\{idExpr\}::text/,
  },
  {
    name: "customers.routes.ts imports the shared customer predicate",
    file: CUSTOMERS_ROUTE,
    pattern: /import \{ customerHasTransactionsSql \} from "\.\.\/accounting\/has-transactions-predicate\.js"/,
  },
  {
    name: "customers.routes.ts calls the shared predicate with opco scope (batch82)",
    file: CUSTOMERS_ROUTE,
    pattern: /filters\.push\(customerHasTransactionsSql\("id",/,
  },
  {
    name: "vendors.routes.ts imports the shared vendor predicate",
    file: VENDORS_ROUTE,
    pattern: /import \{ vendorHasTransactionsSql \} from "\.\.\/accounting\/has-transactions-predicate\.js"/,
  },
  {
    name: "vendors.routes.ts calls the shared predicate with opco scope (batch82)",
    file: VENDORS_ROUTE,
    pattern: /filters\.push\(vendorHasTransactionsSql\("id",/,
  },
  {
    name: "customer predicate scopes invoices by operating_company_id (batch82)",
    file: SHARED,
    pattern: /i\.operating_company_id = \$\{opcoExpr\}/,
  },
  {
    name: "vendor predicate scopes bills by operating_company_id (batch82)",
    file: SHARED,
    pattern: /b\.operating_company_id = \$\{opcoExpr\}/,
  },
];

const FORBIDDEN = [
  {
    name: "vendor predicate must never reference the nonexistent vendor_credits.vendor_uuid column",
    file: SHARED,
    pattern: /vc\.vendor_uuid/,
    mutate: (source) => source.replace("vc.vendor_id::text", "vc.vendor_uuid::text"),
  },
  {
    name: "customers.routes.ts must not call customerHasTransactionsSql with only one argument (batch82 regression guard)",
    file: CUSTOMERS_ROUTE,
    pattern: /customerHasTransactionsSql\("id"\)/,
    mutate: (source) => source.replace(/customerHasTransactionsSql\("id", `\$\$\{companyScopeIdx\}::uuid`\)/, 'customerHasTransactionsSql("id")'),
  },
  {
    name: "vendors.routes.ts must not call vendorHasTransactionsSql with only one argument (batch82 regression guard)",
    file: VENDORS_ROUTE,
    pattern: /vendorHasTransactionsSql\("id"\)/,
    mutate: (source) => source.replace(/vendorHasTransactionsSql\("id", `\$\$\{companyScopeIdx\}::uuid`\)/, 'vendorHasTransactionsSql("id")'),
  },
];

function readSources() {
  return Object.fromEntries(
    [SHARED, CUSTOMERS_ROUTE, VENDORS_ROUTE].map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")])
  );
}

function run(sources) {
  const failures = CHECKS.filter((c) => !c.pattern.test(sources[c.file])).map((c) => c.name);
  failures.push(...FORBIDDEN.filter((c) => c.pattern.test(sources[c.file])).map((c) => c.name));
  return failures;
}

if (process.argv.includes("--selftest")) {
  const live = readSources();
  if (run(live).length) {
    console.error(`${LABEL} SELFTEST FAIL live:\n- ${run(live).join("\n- ")}`);
    process.exit(1);
  }
  for (const check of CHECKS) {
    const globalPattern = new RegExp(check.pattern.source, check.pattern.flags.includes("g") ? check.pattern.flags : `${check.pattern.flags}g`);
    const plantedSource = live[check.file].replace(globalPattern, "/* planted defect */");
    const planted = { ...live, [check.file]: plantedSource };
    if (plantedSource === live[check.file] || !run(planted).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted defect stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  for (const check of FORBIDDEN) {
    const plantedSource = check.mutate(live[check.file]);
    const planted = { ...live, [check.file]: plantedSource };
    if (plantedSource === live[check.file] || !run(planted).includes(check.name)) {
      console.error(`${LABEL} SELFTEST FAIL — planted forbidden regression stayed green: ${check.name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${CHECKS.length + FORBIDDEN.length}/${CHECKS.length + FORBIDDEN.length} planted defects rejected`);
  process.exit(0);
}

const fails = run(readSources());
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — customers and vendors list endpoints share ONE has-transactions predicate`);
