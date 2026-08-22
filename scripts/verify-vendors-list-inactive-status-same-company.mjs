#!/usr/bin/env node
/**
 * ACCT-F5768 — VENDORS-LIST-INACTIVE-FILTER-CONTRADICTS-RLS. The vendors LIST endpoint's status=inactive
 * filter (deactivated_at IS NOT NULL) directly contradicts vendors_select's own RLS USING clause
 * (deactivated_at IS NULL required for any non-bypass reader) — ANDed together they can never both hold,
 * so status=inactive always returned 0 rows for a real user regardless of real data. Live-confirmed: 11
 * real deactivated USMCA vendors exist, but the identical query as ih35_app returned 0 before this fix.
 *
 * INVARIANT (static — no database): apps/backend/src/mdata/vendors.routes.ts's LIST endpoint must route
 * the status=inactive branch through mdata.list_vendors_same_company (a same-company-scoped SECURITY
 * DEFINER resolver) instead of reading mdata.vendors directly, and the migration creating that function
 * must be SECURITY DEFINER, scoped by operating_company_id, and grant EXECUTE to ih35_app only — never
 * PUBLIC, and never touch vendors_select itself (would reopen the active-picker leak risk prior
 * migrations 202612780000 / 202613040000 explicitly avoided).
 *
 * Self-test: node scripts/verify-vendors-list-inactive-status-same-company.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_FILE = "apps/backend/src/mdata/vendors.routes.ts";
const MIGRATIONS_DIR = "db/migrations";
const LABEL = "verify-vendors-list-inactive-status-same-company";

function latestListVendorsSameCompanyMigration() {
  const dir = path.join(ROOT, MIGRATIONS_DIR);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) => {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    return /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+mdata\.list_vendors_same_company/i.test(src);
  });
  matches.sort();
  return matches[matches.length - 1] ?? null;
}

export function checkRouteSource(src) {
  const problems = [];
  if (!/status === "inactive" \? "mdata\.list_vendors_same_company/.test(src)) {
    problems.push("LIST endpoint no longer routes status=inactive through mdata.list_vendors_same_company");
  }
  return problems;
}

export function checkMigrationSource(src) {
  const problems = [];
  if (!/SECURITY DEFINER/.test(src)) {
    problems.push("mdata.list_vendors_same_company is not SECURITY DEFINER");
  }
  if (!/v\.operating_company_id\s*=\s*p_operating_company_id/.test(src)) {
    problems.push("mdata.list_vendors_same_company does not scope by operating_company_id — cross-tenant read risk");
  }
  if (!/GRANT EXECUTE ON FUNCTION mdata\.list_vendors_same_company\(uuid\) TO ih35_app/.test(src)) {
    problems.push("EXECUTE not granted to ih35_app");
  }
  if (/GRANT EXECUTE ON FUNCTION mdata\.list_vendors_same_company\(uuid\) TO PUBLIC/.test(src)) {
    problems.push("EXECUTE granted to PUBLIC — must be ih35_app only");
  }
  if (/ALTER (POLICY|TABLE mdata\.vendors)\b.*vendors_select/is.test(src) || /DROP POLICY.*vendors_select/i.test(src)) {
    problems.push("this migration touches vendors_select directly — established pattern is a same-company SECURITY DEFINER resolver, not weakening RLS");
  }
  return problems;
}

function selftest() {
  const goodRoute = `
    const fromClause = status === "inactive" ? "mdata.list_vendors_same_company($1::uuid)" : "mdata.vendors";
  `;
  const goodRouteProblems = checkRouteSource(goodRoute);
  if (goodRouteProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good route fixture flagged: ${goodRouteProblems.join("; ")}`);
    process.exit(1);
  }
  const routeMutations = [goodRoute.replace("list_vendors_same_company", "vendors")];
  for (const [i, mutated] of routeMutations.entries()) {
    if (checkRouteSource(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — route regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }

  const goodMigration = `
    CREATE OR REPLACE FUNCTION mdata.list_vendors_same_company(p_operating_company_id uuid)
    RETURNS SETOF mdata.vendors
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = pg_catalog, mdata
    STABLE
    AS $$
      SELECT v.* FROM mdata.vendors v WHERE v.operating_company_id = p_operating_company_id
    $$;
    REVOKE ALL ON FUNCTION mdata.list_vendors_same_company(uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION mdata.list_vendors_same_company(uuid) TO ih35_app;
  `;
  const goodMigrationProblems = checkMigrationSource(goodMigration);
  if (goodMigrationProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good migration fixture flagged: ${goodMigrationProblems.join("; ")}`);
    process.exit(1);
  }
  const migrationMutations = [
    goodMigration.replace("SECURITY DEFINER", ""),
    goodMigration.replace("v.operating_company_id = p_operating_company_id", "true"),
    goodMigration.replace("TO ih35_app", "TO PUBLIC"),
    goodMigration + "\nALTER POLICY vendors_select ON mdata.vendors USING (true);",
  ];
  for (const [i, mutated] of migrationMutations.entries()) {
    if (checkMigrationSource(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — migration regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }

  console.log(`${LABEL} SELFTEST PASS — ${routeMutations.length + migrationMutations.length} regression mutations all detected`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const failures = [];

const routePath = path.join(ROOT, ROUTE_FILE);
if (!fs.existsSync(routePath)) {
  failures.push(`${ROUTE_FILE}: file not found`);
} else {
  for (const f of checkRouteSource(fs.readFileSync(routePath, "utf8"))) failures.push(`${ROUTE_FILE}: ${f}`);
}

const migrationFile = latestListVendorsSameCompanyMigration();
if (!migrationFile) {
  failures.push(`${MIGRATIONS_DIR}: no migration defining mdata.list_vendors_same_company found`);
} else {
  const src = fs.readFileSync(path.join(ROOT, MIGRATIONS_DIR, migrationFile), "utf8");
  for (const f of checkMigrationSource(src)) failures.push(`${migrationFile}: ${f}`);
}

if (failures.length) {
  console.error(`[${LABEL}] FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — vendors LIST endpoint's status=inactive branch reads through the same-company SECURITY DEFINER resolver, vendors_select untouched`);
