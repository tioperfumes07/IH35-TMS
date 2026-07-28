#!/usr/bin/env node
/**
 * FACT-PHANTOM-01 + FACT-01 — prevent a retired factoring-company profile from
 * returning as an app dependency or as a WHERE-false factoring_summary fallback.
 *
 * Self-test: node scripts/verify-no-phantom-factoring-companies.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APPS = path.join(ROOT, "apps");
const VIRTUAL_ROUTE = "apps/backend/src/banking/factoring-virtual.routes.ts";
const FACTORING_ROUTE = "apps/backend/src/factoring/factoring.routes.ts";
const SUMMARY_MIGRATION =
  "db/migrations/202609100100_fact_phantom_01_fact_01_factoring_summary_linkage.sql";
const HELD_REGISTRY = "db/migrations/.held-migrations.json";
const PHANTOM = "accounting.factoring_companies";
const LINKAGE_VIEW = "views.factoring_balance_invoice_linkage";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function appSources(dir = APPS) {
  const sources = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sources.push(...appSources(full));
    else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
      sources.push([path.relative(ROOT, full), fs.readFileSync(full, "utf8")]);
    }
  }
  return sources;
}

export function check({ sources, virtualRoute, factoringRoute, summaryMigration, heldRegistry }) {
  const failures = [];
  const phantomReferences = sources
    .filter(([, source]) => source.includes(PHANTOM))
    .map(([file]) => file);
  if (phantomReferences.length) {
    failures.push(`apps/** must not reference ${PHANTOM}: ${phantomReferences.join(", ")}`);
  }

  if (!virtualRoute.includes(`to_regclass('${LINKAGE_VIEW}')`)) {
    failures.push(`${VIRTUAL_ROUTE}: must fail closed when the canonical linkage view is unavailable`);
  }
  if (!/code\(503\)/.test(virtualRoute) || !virtualRoute.includes("202607600000_factoring_balance_invoice_linkage.sql")) {
    failures.push(`${VIRTUAL_ROUTE}: missing linkage-view 503 with prerequisite migration name`);
  }
  if (
    !virtualRoute.includes("reserve_receivable_signed_cents") ||
    !virtualRoute.includes("outstanding_liability_signed_cents")
  ) {
    failures.push(`${VIRTUAL_ROUTE}: must aggregate signed reserve and liability cents from the linkage view`);
  }
  if (!factoringRoute.includes("factoring.canonical_factor_agreements") || !factoringRoute.includes("voided_at = now()")) {
    failures.push(`${FACTORING_ROUTE}: deactivate must archive the canonical agreement`);
  }

  if (!summaryMigration.includes(`FROM ${LINKAGE_VIEW}`)) {
    failures.push(`${SUMMARY_MIGRATION}: factoring_summary must read the canonical linkage view`);
  }
  if (!/WITH\s*\(\s*security_invoker\s*=\s*true\s*\)/i.test(summaryMigration)) {
    failures.push(`${SUMMARY_MIGRATION}: factoring_summary must be security_invoker`);
  }
  if (/\bWHERE\s+false\b/i.test(summaryMigration)) {
    failures.push(`${SUMMARY_MIGRATION}: must not restore a WHERE-false summary stub`);
  }
  if (
    !summaryMigration.includes("COUNT(*)::int AS active_factor_count") ||
    !summaryMigration.includes("(fc.active_factor_count <= 1) AS single_factor_invariant_ok")
  ) {
    failures.push(`${SUMMARY_MIGRATION}: single-factor invariant must derive from real linkage rows`);
  }
  if (!heldRegistry.includes("202609100100_fact_phantom_01_fact_01_factoring_summary_linkage.sql")) {
    failures.push(`${HELD_REGISTRY}: missing FACT-PHANTOM-01 + FACT-01 held migration registration`);
  }

  return failures;
}

export function run() {
  return check({
    sources: appSources(),
    virtualRoute: read(VIRTUAL_ROUTE),
    factoringRoute: read(FACTORING_ROUTE),
    summaryMigration: read(SUMMARY_MIGRATION),
    heldRegistry: read(HELD_REGISTRY),
  });
}

if (process.argv.includes("--selftest")) {
  const good = {
    sources: [["apps/backend/src/example.ts", "SELECT views.factoring_balance_invoice_linkage"]],
    virtualRoute:
      "to_regclass('views.factoring_balance_invoice_linkage') code(503) 202607600000_factoring_balance_invoice_linkage.sql reserve_receivable_signed_cents outstanding_liability_signed_cents",
    factoringRoute: "factoring.canonical_factor_agreements voided_at = now()",
    summaryMigration:
      "WITH (security_invoker = true) FROM views.factoring_balance_invoice_linkage COUNT(*)::int AS active_factor_count (fc.active_factor_count <= 1) AS single_factor_invariant_ok",
    heldRegistry: "202609100100_fact_phantom_01_fact_01_factoring_summary_linkage.sql",
  };
  const checks = [
    ["healthy source passes", check(good).length === 0],
    [
      "phantom reference is caught",
      check({ ...good, sources: [["apps/backend/src/example.ts", PHANTOM]] }).some((failure) =>
        failure.includes("must not reference")
      ),
    ],
    [
      "summary fallback is caught",
      check({ ...good, summaryMigration: `${good.summaryMigration} WHERE false` }).some((failure) =>
        failure.includes("WHERE-false")
      ),
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:no-phantom-factoring-companies --selftest FAIL");
    for (const [name] of failed) console.error(`  - ${name}`);
    process.exit(1);
  }
  console.log(`verify:no-phantom-factoring-companies --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = run();
  if (failures.length) {
    console.error("verify:no-phantom-factoring-companies FAIL");
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("verify:no-phantom-factoring-companies PASS");
}
