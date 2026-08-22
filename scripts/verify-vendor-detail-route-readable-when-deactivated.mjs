#!/usr/bin/env node
/**
 * ACCT-F5767 — VENDORS-SELECT-HIDES-DEACTIVATED (LIVE FAIL). mdata.vendors' vendors_select RLS policy
 * requires deactivated_at IS NULL for any non-bypass reader, so GET /api/v1/mdata/vendors/:id 404s for
 * an archived vendor even when a real historical FK (e.g. a vendor credit) legitimately cites it —
 * live-confirmed against 308f6434-0a51-4109-953e-c86ffb1f0999 (USMCA), cited by VC-2026-0001. A prior,
 * deliberate migration (202612780000) explicitly declined to weaken vendors_select directly (risk of
 * leaking archived vendors into active pickers/rosters), so this follows the same established pattern:
 * a narrow, same-company-scoped SECURITY DEFINER resolver (mdata.get_vendor_same_company) used as a
 * FALLBACK only when the primary RLS-scoped read finds nothing — never as the primary path.
 *
 * INVARIANT (static — no database): the GET /api/v1/mdata/vendors/:id route must query
 * mdata.get_vendor_same_company as a fallback when the primary mdata.vendors read returns no row, and
 * the migration creating that function must be SECURITY DEFINER, same-company scoped (WHERE
 * v.operating_company_id = p_operating_company_id), and grant EXECUTE to ih35_app only — never PUBLIC,
 * and never touch the vendors_select policy itself (that would reopen the active-picker leak risk the
 * prior migration explicitly avoided).
 *
 * Self-test: node scripts/verify-vendor-detail-route-readable-when-deactivated.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE_FILE = "apps/backend/src/mdata/vendors.routes.ts";
const MIGRATIONS_DIR = "db/migrations";
const LABEL = "verify-vendor-detail-route-readable-when-deactivated";

function latestVendorSameCompanyMigration() {
  const dir = path.join(ROOT, MIGRATIONS_DIR);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) => {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    return /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+mdata\.get_vendor_same_company/i.test(src);
  });
  matches.sort();
  return matches[matches.length - 1] ?? null;
}

export function checkRouteSource(src) {
  const problems = [];
  if (!/get_vendor_same_company/.test(src)) {
    problems.push("GET :id route no longer references mdata.get_vendor_same_company — fallback removed");
  }
  if (!/if \(res\.rows\[0\]\) return res\.rows\[0\];/.test(src)) {
    problems.push("primary RLS-scoped read no longer short-circuits before the fallback — fallback may have become the primary path");
  }
  return problems;
}

export function checkMigrationSource(src) {
  const problems = [];
  if (!/SECURITY DEFINER/.test(src)) {
    problems.push("mdata.get_vendor_same_company is not SECURITY DEFINER");
  }
  if (!/v\.operating_company_id\s*=\s*p_operating_company_id/.test(src)) {
    problems.push("mdata.get_vendor_same_company does not scope by operating_company_id — cross-tenant read risk");
  }
  if (!/GRANT EXECUTE ON FUNCTION mdata\.get_vendor_same_company\(uuid, uuid\) TO ih35_app/.test(src)) {
    problems.push("EXECUTE not granted to ih35_app");
  }
  if (/GRANT EXECUTE ON FUNCTION mdata\.get_vendor_same_company\(uuid, uuid\) TO PUBLIC/.test(src)) {
    problems.push("EXECUTE granted to PUBLIC — must be ih35_app only");
  }
  if (/ALTER (POLICY|TABLE mdata\.vendors)\b.*vendors_select/is.test(src) || /DROP POLICY.*vendors_select/i.test(src)) {
    problems.push("this migration touches vendors_select directly — the established fix pattern is a same-company SECURITY DEFINER fallback, not weakening the RLS policy (reopens the active-picker leak risk 202612780000 explicitly avoided)");
  }
  return problems;
}

function selftest() {
  const goodRoute = `
    if (res.rows[0]) return res.rows[0];
    const fallback = await client.query(
      \`SELECT * FROM mdata.get_vendor_same_company($1::uuid, $2::uuid) AS v LIMIT 1\`,
      [id, companyId]
    );
    return fallback.rows[0] ?? null;
  `;
  const goodRouteProblems = checkRouteSource(goodRoute);
  if (goodRouteProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good route fixture flagged: ${goodRouteProblems.join("; ")}`);
    process.exit(1);
  }
  const routeMutations = [
    goodRoute.replace(/get_vendor_same_company/g, "get_vendor_anything_else"),
    goodRoute.replace("if (res.rows[0]) return res.rows[0];\n    ", ""),
  ];
  for (const [i, mutated] of routeMutations.entries()) {
    if (checkRouteSource(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — route regression mutation ${i} escaped detection`);
      process.exit(1);
    }
  }

  const goodMigration = `
    CREATE OR REPLACE FUNCTION mdata.get_vendor_same_company(p_vendor_id uuid, p_operating_company_id uuid)
    RETURNS SETOF mdata.vendors
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = pg_catalog, mdata
    STABLE
    AS $$
      SELECT v.* FROM mdata.vendors v
      WHERE v.id = p_vendor_id AND v.operating_company_id = p_operating_company_id
    $$;
    REVOKE ALL ON FUNCTION mdata.get_vendor_same_company(uuid, uuid) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION mdata.get_vendor_same_company(uuid, uuid) TO ih35_app;
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

const migrationFile = latestVendorSameCompanyMigration();
if (!migrationFile) {
  failures.push(`${MIGRATIONS_DIR}: no migration defining mdata.get_vendor_same_company found`);
} else {
  const src = fs.readFileSync(path.join(ROOT, MIGRATIONS_DIR, migrationFile), "utf8");
  for (const f of checkMigrationSource(src)) failures.push(`${migrationFile}: ${f}`);
}

if (failures.length) {
  console.error(`[${LABEL}] FAILED:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — vendor detail route falls back to the same-company SECURITY DEFINER resolver when the RLS-scoped read finds nothing, vendors_select untouched`);
