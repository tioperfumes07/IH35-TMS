#!/usr/bin/env node
/**
 * ACCT-F5788 — CLS-DEACTIVATED-PLAIN-JOIN-CUSTOMERS-VENDORS (accounting/from-load.ts instance).
 * mdata.customers' customers_select RLS requires deactivated_at IS NULL for a non-bypass reader, so
 * buildInvoiceFromLoad()'s plain JOIN mdata.customers threw a misleading load_not_found (the load DOES
 * exist; only its customer's active/inactive status changed) the moment a load's customer was archived
 * after booking — blocking legitimate invoicing for real freight revenue. Live-confirmed via Chrome: a
 * real USMCA load (LUSMCAFREIGHT-20260807-0001) with a deactivated customer and no invoice yet exists
 * on prod; its "Create / View Invoice" action is FE-gated to delivered loads, so a full live
 * reproduction of buildInvoiceFromLoad specifically requires a deliberate book->deliver->deactivate
 * sequence not taken this pass — fixed on pattern-match confidence, since the same class has now been
 * live-proven 3 times in this exact codebase (ACCT-F5784/5785/5786/5787).
 *
 * Fixed by reusing the SAME full-row resolver ACCT-F5787 already shipped (mdata.get_customer_same_
 * company, no new migration) via a LEFT JOIN LATERAL fallback gated on "c.id IS NULL" — the resolver
 * only runs when the primary RLS-scoped join already found nothing. customers_select untouched.
 *
 * INVARIANT (static — no database): buildInvoiceFromLoad's customer join must be a LEFT JOIN (never
 * plain/INNER), must LEFT JOIN LATERAL mdata.get_customer_same_company gated on "c.id IS NULL", and
 * payment_terms_id / ar_email / ar_phone must all be COALESCEd with the c2 fallback.
 *
 * Self-test: node scripts/verify-from-load-customer-left-join.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_FILE = "apps/backend/src/accounting/from-load.ts";
const LABEL = "verify-from-load-customer-left-join";

export function checkRouteSource(src) {
  const problems = [];
  if (!/LEFT JOIN mdata\.customers c ON c\.id = l\.customer_id/.test(src)) {
    problems.push("buildInvoiceFromLoad's load query no longer LEFT JOINs mdata.customers — a plain/INNER JOIN would throw a misleading load_not_found for a deactivated customer");
  }
  if (/(?<!LEFT )JOIN mdata\.customers c ON c\.id = l\.customer_id/.test(src)) {
    problems.push("a plain (INNER) JOIN mdata.customers on l.customer_id was found — must be LEFT JOIN");
  }
  if (!/LEFT JOIN LATERAL \(\s*SELECT \* FROM mdata\.get_customer_same_company\(l\.customer_id, l\.operating_company_id\)\s*WHERE c\.id IS NULL\s*\) c2 ON true/.test(src)) {
    problems.push("LATERAL fallback to mdata.get_customer_same_company (gated on c.id IS NULL) is missing or malformed");
  }
  if (!/COALESCE\(c\.payment_terms_id, c2\.payment_terms_id\) AS payment_terms_id/.test(src)) {
    problems.push("payment_terms_id is not COALESCEd with the c2 fallback");
  }
  if (!/COALESCE\(c\.ar_email, c2\.ar_email\) AS ar_email/.test(src)) {
    problems.push("ar_email is not COALESCEd with the c2 fallback");
  }
  if (!/COALESCE\(c\.ar_phone, c2\.ar_phone\) AS ar_phone/.test(src)) {
    problems.push("ar_phone is not COALESCEd with the c2 fallback");
  }
  if (/ALTER (POLICY|TABLE mdata\.customers)\b.*customers_select/is.test(src) || /DROP POLICY.*customers_select/i.test(src)) {
    problems.push("this file touches customers_select directly — the established fix pattern is a same-company SECURITY DEFINER fallback, not weakening the RLS policy");
  }
  return problems;
}

function selftest() {
  const goodSrc = `
      SELECT
        l.id,
        COALESCE(c.payment_terms_id, c2.payment_terms_id) AS payment_terms_id,
        COALESCE(c.ar_email, c2.ar_email) AS ar_email,
        COALESCE(c.ar_phone, c2.ar_phone) AS ar_phone
      FROM mdata.loads l
      LEFT JOIN mdata.customers c ON c.id = l.customer_id AND c.operating_company_id = l.operating_company_id
      LEFT JOIN LATERAL (
        SELECT * FROM mdata.get_customer_same_company(l.customer_id, l.operating_company_id)
        WHERE c.id IS NULL
      ) c2 ON true
  `;
  const cases = [
    { name: "good route (LEFT JOIN + LATERAL fallback, all 3 columns COALESCEd)", src: goodSrc, expectProblems: false },
    {
      name: "reverted to plain JOIN",
      src: goodSrc.replace("LEFT JOIN mdata.customers c ON c.id = l.customer_id", "JOIN mdata.customers c ON c.id = l.customer_id"),
      expectProblems: true,
    },
    {
      name: "LATERAL fallback removed",
      src: goodSrc.replace(/LEFT JOIN LATERAL[\s\S]*?c2 ON true/, "-- lateral removed"),
      expectProblems: true,
    },
    {
      name: "ar_email COALESCE removed",
      src: goodSrc.replace("COALESCE(c.ar_email, c2.ar_email) AS ar_email", "c.ar_email AS ar_email"),
      expectProblems: true,
    },
    {
      name: "payment_terms_id COALESCE removed",
      src: goodSrc.replace("COALESCE(c.payment_terms_id, c2.payment_terms_id) AS payment_terms_id", "c.payment_terms_id AS payment_terms_id"),
      expectProblems: true,
    },
    {
      name: "customers_select weakened directly (forbidden shortcut)",
      src: goodSrc + `\nALTER TABLE mdata.customers customers_select ...;`,
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
  console.log(`${LABEL}: OK — buildInvoiceFromLoad LEFT JOINs mdata.customers with a LATERAL same-company resolver fallback, customers_select untouched`);
}

main();
