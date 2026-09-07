#!/usr/bin/env node
/**
 * ACCT-F5787 — CLS-DEACTIVATED-PLAIN-JOIN-CUSTOMERS-VENDORS (factoring/submission-queue.service.ts
 * instance). mdata.customers' customers_select RLS requires deactivated_at IS NULL for a non-bypass
 * reader, so the "submit to Faro" queue's plain JOIN mdata.customers silently dropped a real,
 * currently-sendable invoice the moment its customer was deactivated. Migration 202613060000 adds
 * mdata.get_customer_same_company (RETURNS SETOF mdata.customers, mirrors mdata.get_vendor_same_company
 * / ACCT-F5767 exactly). Fixed via a LEFT JOIN + a LATERAL fallback that only invokes the resolver when
 * the primary RLS-scoped join already found nothing (WHERE c.id IS NULL) — the common (active
 * customer) path never calls the resolver.
 *
 * SUPERSEDED IN PART BY ACCT-F26011 (owner, 2026-09-06, root-caused live via Cursor + independently
 * re-verified): the original fix gated submittability on mdata.customers.factoring_company_vendor_id
 * joined to mdata.vendors — a denormalized mirror column populated on only 2 of 1,226 customers
 * actually assigned in the authoritative factoring.customer_factor_assignment table (measured live,
 * USMCA prod), so ~99.9% of Faro-assigned invoices silently never reached this queue.
 * batch.service.ts's getFactorForCustomer already read customer_factor_assignment correctly, so the
 * fix repointed this query at the SAME authoritative, effective-dated source (LEFT JOIN LATERAL over
 * factoring.customer_factor_assignment + factoring.factor, keyed on COALESCE(c.id, c2.id) — the SAME
 * c/c2 customer resolved above, so the ACCT-F5787 deactivated-customer fix is still fully exercised)
 * instead of mdata.vendors, which factoring.factor carries no vendor_id back to. This guard was
 * updated in the same pass to check the CURRENT (customer_factor_assignment) mechanism instead of the
 * one it replaced — the old mdata.vendors join check would otherwise permanently fail against
 * legitimately-fixed code.
 *
 * Live-verified: the LATERAL-only-when-null mechanism deterministically resolves customer_name via
 * the fallback when the primary join is forced to miss (c.id IS NULL), independent of RLS session
 * state; assigned_factor resolves through the SAME c/c2 customer id either way.
 *
 * INVARIANT (static — no database): the submission-queue query must LEFT JOIN (never plain/INNER JOIN)
 * mdata.customers, must LEFT JOIN LATERAL mdata.get_customer_same_company gated on "c.id IS NULL",
 * must LEFT JOIN LATERAL factoring.customer_factor_assignment (effective-dated, not voided) keyed on
 * COALESCE(c.id, c2.id) — never the retired mdata.customers.factoring_company_vendor_id mirror — and
 * gate the WHERE clause on assigned_factor.id IS NOT NULL. customer_name must be COALESCEd with the c2
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
  if (!/FROM factoring\.customer_factor_assignment cfa\s*\n\s*JOIN factoring\.factor f ON f\.id = cfa\.factor_id AND f\.voided_at IS NULL/.test(src)) {
    problems.push("assigned-factor lookup no longer joins factoring.customer_factor_assignment -> factoring.factor (ACCT-F26011) — reverted to the retired mdata.vendors/factoring_company_vendor_id mirror, or the voided_at guard was dropped");
  }
  if (!/WHERE cfa\.customer_id = COALESCE\(c\.id, c2\.id\)/.test(src)) {
    problems.push("customer_factor_assignment lookup no longer keys off COALESCE(c.id, c2.id) — the ACCT-F5787 deactivated-customer fallback would stop covering the factor-assignment leg");
  }
  if (!/COALESCE\(c\.customer_name, c2\.customer_name\) AS customer_name/.test(src)) {
    problems.push("customer_name is not COALESCEd with the c2 fallback");
  }
  if (!/AND assigned_factor\.id\s+IS NOT NULL/.test(src)) {
    problems.push("the WHERE clause no longer requires assigned_factor.id IS NOT NULL (ACCT-F26011) — an invoice with no live customer_factor_assignment would wrongly reach the queue, or the check reverted to the retired factoring_company_vendor_id column");
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
    LEFT JOIN LATERAL (
      SELECT f.id, f.name
      FROM factoring.customer_factor_assignment cfa
      JOIN factoring.factor f ON f.id = cfa.factor_id AND f.voided_at IS NULL
      WHERE cfa.customer_id = COALESCE(c.id, c2.id)
        AND cfa.tenant_id   = $1::uuid
        AND cfa.voided_at   IS NULL
      ORDER BY cfa.effective_from DESC
      LIMIT 1
    ) assigned_factor ON true
    WHERE i.operating_company_id = $1::uuid
      AND assigned_factor.id     IS NOT NULL
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
      name: "get_customer_same_company LATERAL fallback removed",
      src: goodSrc.replace(/LEFT JOIN LATERAL[\s\S]*?c2 ON true/, "-- lateral removed"),
      expectProblems: true,
    },
    {
      name: "assigned-factor lookup reverted to retired mdata.vendors/factoring_company_vendor_id mirror (ACCT-F26011 regression)",
      src: goodSrc.replace(
        /FROM factoring\.customer_factor_assignment cfa\s*\n\s*JOIN factoring\.factor f ON f\.id = cfa\.factor_id AND f\.voided_at IS NULL/,
        "FROM mdata.vendors fv WHERE fv.id = COALESCE(c.factoring_company_vendor_id, c2.factoring_company_vendor_id)"
      ),
      expectProblems: true,
    },
    {
      name: "customer_factor_assignment lookup no longer keyed on COALESCE(c.id, c2.id)",
      src: goodSrc.replace("WHERE cfa.customer_id = COALESCE(c.id, c2.id)", "WHERE cfa.customer_id = c.id"),
      expectProblems: true,
    },
    {
      name: "WHERE filter reverted off assigned_factor.id",
      src: goodSrc.replace("AND assigned_factor.id     IS NOT NULL", "AND c.factoring_company_vendor_id IS NOT NULL"),
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
  console.log(`${LABEL}: OK — submission-queue query LEFT JOINs mdata.customers with a LATERAL same-company resolver fallback and resolves the assigned factor via factoring.customer_factor_assignment (ACCT-F26011), customers_select untouched`);
}

main();
