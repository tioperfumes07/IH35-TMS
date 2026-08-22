#!/usr/bin/env node
/**
 * ACCT-F5786 — CLS-DEACTIVATED-PLAIN-JOIN-CUSTOMERS-VENDORS (invoice-send.service.ts instance).
 * mdata.customers' customers_select RLS requires deactivated_at IS NULL for a non-bypass reader, so
 * invoice-send.service.ts's notification-read query's plain JOIN mdata.customers silently dropped the
 * WHOLE row for a deactivated customer's invoice — including i.ar_email_snapshot, which lives on
 * accounting.invoices itself and is NOT gated by customers RLS at all, so a real transmission address
 * could exist and never be read. Also mislabeled the LV-013 audit reason as "no customer row resolved
 * for this invoice in this entity" (implying the customer doesn't exist) when it was only deactivated.
 * Live-reproduced as the real ih35_app runtime role (confirmed via current_user in the same query)
 * against a real invoice with a deactivated customer (d921fbde-b6e2-4e65-9e21-8bcf4278a862,
 * INV-2026-00005): broken query returns 0 rows, fixed query resolves the real customer name.
 * Same class already fixed 5 times this session (ACCT-F5611/5767/5768/5784/5785) — reuses the SAME
 * existing SECURITY DEFINER resolver (mdata.resolve_customer_label_same_company), no new migration,
 * customers_select itself untouched.
 *
 * INVARIANT (static — no database): the notification-read query in invoice-send.service.ts must
 * LEFT JOIN (never a plain/INNER JOIN) mdata.customers, and customer_name must be COALESCEd with
 * mdata.resolve_customer_label_same_company as a fallback.
 *
 * Self-test: node scripts/verify-invoice-send-customer-left-join.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_FILE = "apps/backend/src/accounting/invoice-send.service.ts";
const LABEL = "verify-invoice-send-customer-left-join";

export function checkRouteSource(src) {
  const problems = [];
  if (!/LEFT JOIN mdata\.customers c/.test(src)) {
    problems.push("notification-read query no longer LEFT JOINs mdata.customers — a plain/INNER JOIN would drop the whole row (including i.ar_email_snapshot) for a deactivated customer");
  }
  if (/(?<!LEFT )JOIN mdata\.customers c\s*\n\s*ON c\.id = i\.customer_id/.test(src)) {
    problems.push("a plain (INNER) JOIN mdata.customers on i.customer_id was found — must be LEFT JOIN");
  }
  if (!/COALESCE\(c\.customer_name,\s*mdata\.resolve_customer_label_same_company\(i\.customer_id,\s*i\.operating_company_id\)\)/.test(src)) {
    problems.push("customer_name is not COALESCEd with mdata.resolve_customer_label_same_company — deactivated-customer fallback missing");
  }
  if (/ALTER (POLICY|TABLE mdata\.customers)\b.*customers_select/is.test(src) || /DROP POLICY.*customers_select/i.test(src)) {
    problems.push("this file touches customers_select directly — the established fix pattern is a same-company SECURITY DEFINER fallback, not weakening the RLS policy");
  }
  return problems;
}

function selftest() {
  const goodSrc = `
    const notifyRes = await client.query(\`
      SELECT
        COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(i.customer_id, i.operating_company_id))::text AS customer_name
      FROM accounting.invoices i
      LEFT JOIN mdata.customers c
        ON c.id = i.customer_id
       AND c.operating_company_id = i.operating_company_id
      WHERE i.id = $1
    \`);
  `;
  const cases = [
    { name: "good route (LEFT JOIN + COALESCE fallback)", src: goodSrc, expectProblems: false },
    {
      name: "reverted to plain JOIN",
      src: goodSrc.replace("LEFT JOIN mdata.customers c", "JOIN mdata.customers c"),
      expectProblems: true,
    },
    {
      name: "COALESCE fallback removed (bare c.customer_name)",
      src: goodSrc.replace(
        "COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(i.customer_id, i.operating_company_id))::text AS customer_name",
        "c.customer_name::text AS customer_name"
      ),
      expectProblems: true,
    },
    {
      name: "customers_select weakened directly (forbidden shortcut)",
      src: goodSrc + `\nALTER TABLE mdata.customers customers_select ...;`,
      expectProblems: true,
    },
    {
      name: "customers_select dropped (forbidden shortcut)",
      src: goodSrc + `\nDROP POLICY customers_select ON mdata.customers;`,
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
  console.log(`${LABEL}: OK — invoice-send.service.ts's notification read LEFT JOINs mdata.customers with a same-company resolver fallback for deactivated customers, customers_select untouched`);
}

main();
