#!/usr/bin/env node
/**
 * ACCT-F5785 — PAYMENTS-DETAIL-CUSTOMER-INNER-JOIN-DEACTIVATED (LIVE FAIL). mdata.customers'
 * customers_select RLS policy requires deactivated_at IS NULL for any non-bypass reader, so
 * fetchPaymentDetail()'s plain JOIN mdata.customers silently dropped the WHOLE payment detail row
 * (not just the customer_name label) once a payment's customer was later archived — live-reproduced
 * as the real ih35_app runtime role (rolbypassrls=false) against 3 real USMCA payments whose customer
 * is deactivated: the broken query returned 0 rows for one of them
 * (a0b83bf5-c9fb-485c-a646-9090b8630bb0), the fixed query returned the real row with the real label.
 * Same defect class already fixed for invoices list/count/detail (ACCT-F5611) and for payments-create
 * (ACCT-F5784) — reuses the SAME existing SECURITY DEFINER resolver
 * (mdata.resolve_customer_label_same_company), no new migration, customers_select itself untouched.
 *
 * INVARIANT (static — no database): fetchPaymentDetail()'s customer join must be a LEFT JOIN (never a
 * plain/INNER JOIN) to mdata.customers, and customer_name must be COALESCEd with
 * mdata.resolve_customer_label_same_company as a fallback.
 *
 * Self-test: node scripts/verify-payments-detail-customer-left-join.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_FILE = "apps/backend/src/accounting/payments.routes.ts";
const LABEL = "verify-payments-detail-customer-left-join";

export function checkRouteSource(src) {
  const problems = [];
  const joinLines = src.match(/^\s*(?:LEFT )?JOIN mdata\.customers c\s*$/gm) || [];
  if (joinLines.length < 3) {
    problems.push(`expected >=3 JOIN mdata.customers c sites (detail, list-count, list-rows) — found ${joinLines.length}`);
  }
  const plainJoins = joinLines.filter((l) => !/LEFT JOIN/.test(l));
  if (plainJoins.length > 0) {
    problems.push(`${plainJoins.length} plain (INNER) JOIN mdata.customers c site(s) remain — must all be LEFT JOIN (a deactivated customer must not drop the whole row)`);
  }
  const coalesceCount = (src.match(/COALESCE\(c\.customer_name,\s*mdata\.resolve_customer_label_same_company\(p\.customer_id,\s*p\.operating_company_id\)\)/g) || []).length;
  if (coalesceCount < 2) {
    problems.push(`expected >=2 COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(...)) fallback site(s) (detail + list-rows) — found ${coalesceCount}`);
  }
  if (/ALTER (POLICY|TABLE mdata\.customers)\b.*customers_select/is.test(src) || /DROP POLICY.*customers_select/i.test(src)) {
    problems.push("this file touches customers_select directly — the established fix pattern is a same-company SECURITY DEFINER fallback, not weakening the RLS policy");
  }
  return problems;
}

function selftest() {
  const oneSite = (n) => `
      SELECT${n === 1 ? "" : " COUNT(*)::int AS total"}
        p.*,
        COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(p.customer_id, p.operating_company_id)) AS customer_name
      FROM accounting.payments p
      LEFT JOIN mdata.customers c
        ON c.id = p.customer_id
       AND c.operating_company_id = p.operating_company_id
      WHERE p.id = $${n}
  `;
  // site 3 (list-count) has no COALESCE — count query only needs the JOIN, matching the real file.
  const countSite = `
      SELECT COUNT(*)::int AS total
      FROM accounting.payments p
      LEFT JOIN mdata.customers c
        ON c.id = p.customer_id
       AND c.operating_company_id = p.operating_company_id
      WHERE ${"${where.join(\" AND \")}"}
  `;
  const goodSrc = `
    async function fetchPaymentDetail() { client.query(\`${oneSite(1)}\`); }
    async function listPayments() {
      const countRes = await client.query(\`${countSite}\`);
      const rowsRes = await client.query(\`${oneSite(2)}\`);
    }
  `;
  const cases = [
    { name: "good route (3 LEFT JOINs, 2 COALESCE fallbacks)", src: goodSrc, expectProblems: false },
    {
      name: "one site reverted to plain JOIN",
      src: goodSrc.replace("LEFT JOIN mdata.customers c\n        ON c.id = p.customer_id\n       AND c.operating_company_id = p.operating_company_id\n      WHERE p.id = $1", "JOIN mdata.customers c\n        ON c.id = p.customer_id\n       AND c.operating_company_id = p.operating_company_id\n      WHERE p.id = $1"),
      expectProblems: true,
    },
    {
      name: "COALESCE fallback removed on one site",
      src: goodSrc.replace(
        "COALESCE(c.customer_name, mdata.resolve_customer_label_same_company(p.customer_id, p.operating_company_id)) AS customer_name\n      FROM accounting.payments p\n      LEFT JOIN mdata.customers c\n        ON c.id = p.customer_id\n       AND c.operating_company_id = p.operating_company_id\n      WHERE p.id = $1",
        "c.customer_name\n      FROM accounting.payments p\n      LEFT JOIN mdata.customers c\n        ON c.id = p.customer_id\n       AND c.operating_company_id = p.operating_company_id\n      WHERE p.id = $1"
      ),
      expectProblems: true,
    },
    {
      name: "one site removed entirely (only 2 JOIN sites left)",
      src: `async function fetchPaymentDetail() { client.query(\`${oneSite(1)}\`); }`,
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
  console.log(`${LABEL}: OK — fetchPaymentDetail LEFT JOINs mdata.customers with a same-company resolver fallback for deactivated customers, customers_select untouched`);
}

main();
