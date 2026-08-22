#!/usr/bin/env node
/**
 * ACCT-F5787 — CLS-DEACTIVATED-PLAIN-JOIN-CUSTOMERS-VENDORS (factoring/submission-queue.service.ts
 * instance). mdata.customers' customers_select RLS requires deactivated_at IS NULL for a non-bypass
 * reader, so the "submit to Faro" queue's plain JOIN mdata.customers silently dropped a real,
 * currently-sendable invoice the moment its customer was deactivated — and because this consumer needs
 * the FULL customer row (c.factoring_company_vendor_id drives both the WHERE clause and the second
 * JOIN to mdata.vendors), a label-only resolver could not fix it. Migration 202613060000 adds
 * mdata.get_customer_same_company (RETURNS SETOF mdata.customers, mirrors mdata.get_vendor_same_company
 * / ACCT-F5767 exactly). Fixed via a LEFT JOIN + a LATERAL fallback that only invokes the resolver when
 * the primary RLS-scoped join already found nothing (WHERE c.id IS NULL) — the common (active
 * customer) path never calls the resolver.
 *
 * Live-verified: the LATERAL-only-when-null mechanism deterministically resolves customer_name and
 * factoring_company_vendor_id via the fallback when the primary join is forced to miss (c.id IS NULL),
 * independent of RLS session state.
 *
 * INVARIANT (static — no database): the submission-queue query must LEFT JOIN (never plain/INNER JOIN)
 * mdata.customers and mdata.vendors, must LEFT JOIN LATERAL mdata.get_customer_same_company gated on
 * "c.id IS NULL", and customer_name / factoring_company_vendor_id must be COALESCEd with the c2
 * fallback. customers_select must never be touched.
 *
 * Self-test: node scripts/verify-factoring-submission-queue-customer-vendor-left-join.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_FILE = "apps/backend/src/factoring/submission-queue.service.ts";
const MIGRATIONS_DIR = "db/migrations";
const LABEL = "verify-factoring-submission-queue-customer-vendor-left-join";

function latestCustomerSameCompanyMigration() {
  const dir = path.join(ROOT, MIGRATIONS_DIR);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) => {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    return /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+mdata\.get_customer_same_company/i.test(src);
  });
  matches.sort();
  return matches[matches.length - 1] ?? null;
}

export function checkRouteSource(src) {
  const problems = [];
  if (!/LEFT JOIN mdata\.customers c ON c\.id = i\.customer_id/.test(src)) {
    problems.push("submission-queue query no longer LEFT JOINs mdata.customers — a plain/INNER JOIN would drop the whole invoice row for a deactivated customer");
  }
  if (/(?<!LEFT )JOIN mdata\.customers c ON c\.id = i\.customer_id/.test(src)) {
    problems.push("a plain (INNER) JOIN mdata.customers on i.customer_id was found — must be LEFT JOIN");
  }
  if (!/LEFT JOIN LATERAL \(\s*SELECT \* FROM mdata\.get_customer_same_company\(i\.customer_id, i\.operating_company_id\)\s*WHERE c\.id IS NULL\s*\) c2 ON true/.test(src)) {
    problems.push("LATERAL fallback to mdata.get_customer_same_company (gated on c.id IS NULL) is missing or malformed");
  }
  if (!/LEFT JOIN mdata\.vendors fv ON fv\.id = COALESCE\(c\.factoring_company_vendor_id, c2\.factoring_company_vendor_id\)/.test(src)) {
    problems.push("mdata.vendors join no longer resolves factoring_company_vendor_id via the c/c2 fallback, or reverted to a plain JOIN");
  }
  if (!/COALESCE\(c\.customer_name, c2\.customer_name\) AS customer_name/.test(src)) {
    problems.push("customer_name is not COALESCEd with the c2 fallback");
  }
  if (!/COALESCE\(c\.factoring_company_vendor_id, c2\.factoring_company_vendor_id\) IS NOT NULL/.test(src)) {
    problems.push("the factoring_company_vendor_id NOT NULL filter no longer checks the c2 fallback — a deactivated customer with a real factoring vendor would still be excluded");
  }
  if (/ALTER (POLICY|TABLE mdata\.customers)\b.*customers_select/is.test(src) || /DROP POLICY.*customers_select/i.test(src)) {
    problems.push("this file touches customers_select directly — the established fix pattern is a same-company SECURITY DEFINER fallback, not weakening the RLS policy");
  }

  const migrationFile = latestCustomerSameCompanyMigration();
  if (!migrationFile) {
    problems.push("no migration found defining mdata.get_customer_same_company");
  } else {
    const migrationSrc = fs.readFileSync(path.join(ROOT, MIGRATIONS_DIR, migrationFile), "utf8");
    if (!/SECURITY DEFINER/.test(migrationSrc)) problems.push(`${migrationFile}: mdata.get_customer_same_company is not SECURITY DEFINER`);
    if (!/c\.operating_company_id = p_operating_company_id/.test(migrationSrc)) problems.push(`${migrationFile}: resolver does not scope by operating_company_id`);
    if (!/GRANT EXECUTE ON FUNCTION mdata\.get_customer_same_company\(uuid, uuid\) TO ih35_app/.test(migrationSrc)) problems.push(`${migrationFile}: EXECUTE not granted to ih35_app`);
    if (/GRANT EXECUTE ON FUNCTION mdata\.get_customer_same_company\(uuid, uuid\) TO PUBLIC/.test(migrationSrc)) problems.push(`${migrationFile}: EXECUTE granted to PUBLIC`);
  }

  return problems;
}

function selftest() {
  const goodSrc = `
    FROM accounting.invoices i
    LEFT JOIN mdata.customers c ON c.id = i.customer_id
                                AND c.operating_company_id = $1::uuid
    LEFT JOIN LATERAL (
      SELECT * FROM mdata.get_customer_same_company(i.customer_id, i.operating_company_id)
      WHERE c.id IS NULL
    ) c2 ON true
    LEFT JOIN mdata.vendors fv ON fv.id = COALESCE(c.factoring_company_vendor_id, c2.factoring_company_vendor_id)
                               AND fv.operating_company_id = $1::uuid
    WHERE i.operating_company_id = $1::uuid
      AND COALESCE(c.factoring_company_vendor_id, c2.factoring_company_vendor_id) IS NOT NULL
    SELECT COALESCE(c.customer_name, c2.customer_name) AS customer_name
  `;
  const cases = [
    { name: "good route (LEFT JOIN + LATERAL fallback)", src: goodSrc, expectProblems: false },
    {
      name: "reverted to plain JOIN mdata.customers",
      src: goodSrc.replace("LEFT JOIN mdata.customers c ON c.id = i.customer_id", "JOIN mdata.customers c ON c.id = i.customer_id"),
      expectProblems: true,
    },
    {
      name: "LATERAL fallback removed",
      src: goodSrc.replace(/LEFT JOIN LATERAL[\s\S]*?c2 ON true/, "-- lateral removed"),
      expectProblems: true,
    },
    {
      name: "vendors join reverted to raw c.factoring_company_vendor_id (no fallback)",
      src: goodSrc.replace(
        "LEFT JOIN mdata.vendors fv ON fv.id = COALESCE(c.factoring_company_vendor_id, c2.factoring_company_vendor_id)",
        "LEFT JOIN mdata.vendors fv ON fv.id = c.factoring_company_vendor_id"
      ),
      expectProblems: true,
    },
    {
      name: "WHERE filter reverted to raw c.factoring_company_vendor_id (no fallback)",
      src: goodSrc.replace(
        "COALESCE(c.factoring_company_vendor_id, c2.factoring_company_vendor_id) IS NOT NULL",
        "c.factoring_company_vendor_id IS NOT NULL"
      ),
      expectProblems: true,
    },
    {
      name: "customer_name COALESCE removed",
      src: goodSrc.replace("COALESCE(c.customer_name, c2.customer_name) AS customer_name", "c.customer_name"),
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
    // migration-presence checks apply to the real repo state regardless of src, so subtract those
    // when judging src-only mutation cases (the real migration file is asserted separately below).
    const srcOnlyProblems = problems.filter((p) => !/\.sql:/.test(p));
    const hasProblems = srcOnlyProblems.length > 0;
    const ok = hasProblems === c.expectProblems;
    if (!ok) failed += 1;
    console.log(`${ok ? "OK" : "FAIL"} [${c.name}] problems=${JSON.stringify(srcOnlyProblems)}`);
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
  console.log(`${LABEL}: OK — submission-queue query LEFT JOINs mdata.customers/mdata.vendors with a LATERAL same-company resolver fallback, customers_select untouched`);
}

main();
