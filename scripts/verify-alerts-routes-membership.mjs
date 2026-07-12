#!/usr/bin/env node
/**
 * verify-alerts-routes-membership.mjs  (0243-g2-2 — alerts subset of "operating_company_id trusted raw")
 *
 * Root cause (design doc 0243-financial-migration-cluster-design-2026-07-11 §C2): the alerts routes accepted a
 * client-supplied operating_company_id, uuid-validated it, and scoped RLS to it — but never asserted the caller
 * is a MEMBER of that company. RLS only matches the value the app SETs, so a uuid-valid id from another entity
 * still reads/writes that entity's rows (the cross-entity-leak class). Fix = call assertCompanyMembership before
 * scoping. This guard locks it: for each alerts route file, the number of assertCompanyMembership() call-sites
 * must be >= 1 AND >= the number of `set_config('app.operating_company_id'` scoping calls in that file, so a new
 * opco-scoped handler cannot ship without its membership check.
 *
 * NON-FINANCIAL: alerts config + dispatch late-arrival reads only — no accounting/catalogs/mdata write, no GL,
 * no migration. Additive authorization hardening (skill §2 — every fix gets a guard).
 *
 * Usage:
 *   node scripts/verify-alerts-routes-membership.mjs            # scan
 *   node scripts/verify-alerts-routes-membership.mjs --selftest # regression -> must recognize good/bad
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();

// Alerts route files that take a client operating_company_id and MUST assert membership before scoping.
// dispatch/alerts.routes.ts scopes inside its service, so its set_config count is 0 — the >=1 floor locks it.
const REQUIRED = [
  "apps/backend/src/alerts/alert.routes.ts",
  "apps/backend/src/dispatch/alerts.routes.ts",
];

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function countMatches(src, re) {
  return (src.match(re) ?? []).length;
}

function scan() {
  const failures = [];
  for (const rel of REQUIRED) {
    const full = path.join(repoRoot, rel);
    if (!fs.existsSync(full)) {
      failures.push(`${rel} — MISSING file (was a required alerts route with membership assertion)`);
      continue;
    }
    const src = stripComments(fs.readFileSync(full, "utf8"));
    const asserts = countMatches(src, /assertCompanyMembership\s*\(/g);
    const scopes = countMatches(src, /set_config\(\s*['"]app\.operating_company_id['"]/g);
    if (asserts < 1) {
      failures.push(`${rel} — no assertCompanyMembership() call (raw operating_company_id trusted; G2-2 leak)`);
      continue;
    }
    if (asserts < scopes) {
      failures.push(`${rel} — ${asserts} assertCompanyMembership() < ${scopes} opco-scoping set_config() — an opco-scoped handler is unguarded`);
    }
  }
  return failures;
}

export function run() {
  const failures = scan();
  if (failures.length) {
    console.error("[verify-alerts-routes-membership] FAIL — an alerts route trusts operating_company_id without membership:");
    for (const f of failures) console.error(`  - ${f}`);
    return { ok: false, offenders: failures };
  }
  console.log(`[verify-alerts-routes-membership] PASS — ${REQUIRED.length} alerts route files assert company membership before scoping`);
  return { ok: true, offenders: [] };
}

export function check() {
  return run().ok;
}

function selftest() {
  const good = `
    await assertCompanyMembership(user.uuid, ocId);
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [ocId]);
  `;
  const bad = `
    await client.query("SELECT set_config('app.operating_company_id', $1, true)", [ocId]);
  `;
  const asserts = (s) => (s.match(/assertCompanyMembership\s*\(/g) ?? []).length;
  const scopes = (s) => (s.match(/set_config\(\s*['"]app\.operating_company_id['"]/g) ?? []).length;
  const passes = (s) => asserts(s) >= 1 && asserts(s) >= scopes(s);
  if (!passes(good)) {
    console.error("[verify-alerts-routes-membership] SELFTEST FAIL — guarded handler not recognized");
    process.exit(1);
  }
  if (passes(bad)) {
    console.error("[verify-alerts-routes-membership] SELFTEST FAIL — unguarded scoping counted as safe");
    process.exit(1);
  }
  console.log("[verify-alerts-routes-membership] SELFTEST PASS — requires >=1 membership assertion and >= opco-scoping count");
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else process.exit(run().ok ? 0 : 1);
}
