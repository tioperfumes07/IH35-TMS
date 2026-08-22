#!/usr/bin/env node
/**
 * ACCT-F5784 — LIVE FAIL. mdata.customers' customers_select RLS policy requires deactivated_at IS
 * NULL for any non-bypass reader, so POST /api/v1/accounting/payments's customer-existence check
 * 404'd with customer_not_found for a real, same-company customer whose record was later archived —
 * live-reproduced through the actual Receive Payment wizard against a real open USMCA invoice
 * (INV-2026-00037, customer 74d472a8-2f8a-4707-9285-5708346e8cd9, "CC2-BOOKLOAD-INLINE-TEST",
 * deactivated_at 2026-08-17). The invoice stayed genuinely open and payable; only the customer's
 * active/inactive lifecycle status changed, so the payment must still be receivable — same reasoning
 * already applied to invoices list/count/detail (ACCT-F5611) and vendors (ACCT-F5767/5768).
 *
 * FIX REUSES the existing SECURITY DEFINER resolver ACCT-F5611 already shipped
 * (mdata.resolve_customer_label_same_company) as a fallback ONLY when the primary RLS-scoped read
 * finds nothing — no new migration, no new function, and customers_select itself must stay untouched
 * (weakening it directly would reopen the active-picker leak risk ACCT-F5611's own migration
 * deliberately avoided).
 *
 * INVARIANT (static — no database): POST /api/v1/accounting/payments's customer lookup must fall back
 * to mdata.resolve_customer_label_same_company when the primary read returns no row, the fallback must
 * run strictly after the primary (never replace it), and this file must never touch customers_select.
 *
 * Self-test: node scripts/verify-payments-create-customer-deactivated-fallback.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_FILE = "apps/backend/src/accounting/payments.routes.ts";
const LABEL = "verify-payments-create-customer-deactivated-fallback";

export function checkRouteSource(src) {
  const problems = [];
  if (!/resolve_customer_label_same_company/.test(src)) {
    problems.push("POST /api/v1/accounting/payments no longer references mdata.resolve_customer_label_same_company — fallback removed");
  }
  if (!/let customerExists = Boolean\(customerRes\.rows\[0\]\)/.test(src)) {
    problems.push("primary RLS-scoped read no longer captured into customerExists before the fallback runs");
  }
  if (!/if \(!customerExists\) \{[\s\S]{0,2000}resolve_customer_label_same_company/.test(src)) {
    problems.push("fallback does not appear to run only when the primary read already found nothing");
  }
  if (/ALTER (POLICY|TABLE mdata\.customers)\b.*customers_select/is.test(src) || /DROP POLICY.*customers_select/i.test(src)) {
    problems.push("this file touches customers_select directly — the established fix pattern is a same-company SECURITY DEFINER fallback, not weakening the RLS policy");
  }
  return problems;
}

function selftest() {
  const goodRoute = `
    const customerRes = await client.query(...);
    let customerExists = Boolean(customerRes.rows[0]);
    if (!customerExists) {
      const fallback = await client.query(
        \`SELECT mdata.resolve_customer_label_same_company($1::uuid, $2::uuid) AS label\`,
        [body.data.customer_id, query.data.operating_company_id]
      );
      customerExists = Boolean(fallback.rows[0]?.label);
    }
    if (!customerExists) return { code: 404 as const, error: "customer_not_found" };
  `;
  const cases = [
    { name: "good route (fallback present, ordered correctly)", src: goodRoute, expectProblems: false },
    {
      name: "fallback removed entirely",
      src: goodRoute.replace(/resolve_customer_label_same_company/g, "REMOVED"),
      expectProblems: true,
    },
    {
      name: "customerExists capture removed",
      src: goodRoute.replace("let customerExists = Boolean(customerRes.rows[0]);", ""),
      expectProblems: true,
    },
    {
      name: "fallback moved before the primary check (defeats short-circuit)",
      src: `
        const fallback = await client.query(
          \`SELECT mdata.resolve_customer_label_same_company($1::uuid, $2::uuid) AS label\`,
          [body.data.customer_id, query.data.operating_company_id]
        );
        const customerRes = await client.query(...);
        let customerExists = Boolean(customerRes.rows[0]);
        if (!customerExists) return { code: 404 as const, error: "customer_not_found" };
      `,
      expectProblems: true,
    },
    {
      name: "customers_select weakened directly (forbidden shortcut)",
      src: goodRoute + `\nALTER TABLE mdata.customers customers_select ...;`,
      expectProblems: true,
    },
    {
      name: "customers_select dropped (forbidden shortcut)",
      src: goodRoute + `\nDROP POLICY customers_select ON mdata.customers;`,
      expectProblems: true,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = checkRouteSource(c.src);
    const hasProblems = problems.length > 0;
    const ok = hasProblems === c.expectProblems;
    if (!ok) failed += 1;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] problems=${JSON.stringify(problems)}`);
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest: ${failed}/${cases.length} mutation case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length}/${cases.length} mutation case(s) PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const src = fs.readFileSync(path.join(ROOT, ROUTE_FILE), "utf8");
  const problems = checkRouteSource(src);
  if (problems.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — POST /api/v1/accounting/payments falls back to the same-company customer resolver when a deactivated customer's RLS-scoped read finds nothing, customers_select untouched`);
}

main();
