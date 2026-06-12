#!/usr/bin/env node
/**
 * run-guard-audit.mjs — audit-only, exits 0 always.
 * Runs each static candidate guard and prints PASS/FAIL per guard.
 */
import { spawnSync } from "node:child_process";
import process from "node:process";

const CANDIDATES = [
  "verify:deep-audit-b-invoices-subnav",
  "verify:deep-audit-b-bell-icon",
  "verify:nav-integrity",
  "verify:ob1-nav-header-unify",
  "verify:settlements-sidebar",
  "verify:tasks-planner-v3",
  "verify:no-bare-health-references",
  "verify:no-internal-language-in-prod-ui",
  "verify:no-duplicate-routes",
  "verify:maint-jump-to-tab-removed",
  "verify:startup-migration-drift-guard",
  "verify:canonical-schema-names",
  "verify:arch-design",
  "verify:canonical-audit-table-name",
  "verify:accounting-route-map",
  "verify:postgres-ssl-explicit",
  "verify:migration-chain-runbook",
  "verify:samsara-config-shape",
  "verify:samsara-webhook-route-mounted",
  "verify:eld-tabs-canonical",
  "verify:mdata-insert-arity",
  "verify:maintenance-insert-column-drift",
  "verify:no-test-users-in-production-list",
  "verify:ds-admin-route-boundary",
  "verify:tenant-scope-on-routes",
  "verify:wo-display-id-format",
  "verify:wo-status-transitions",
  "verify:block-ready-c5-no-duplicate-arch-design",
  "verify:accounting-backbone-schema",
  "verify:accounting-reports-ui-contract",
  "verify:no-orphan-migration-ledger-entries",
  "verify:no-unledgered-migrations",
  "verify:safety-events-append-only",
  "verify:safety-rls-coverage",
  "verify:safety-expiry-tracking-coverage",
  "verify:fleet-table-rows-clickable",
  "verify:fleet-counters-match-rows",
];

const passes = [];
const fails = [];

for (const script of CANDIDATES) {
  const res = spawnSync("npm", ["run", script], {
    cwd: process.cwd(),
    shell: true,
    encoding: "utf8",
    env: process.env,
    timeout: 30_000,
  });
  if (res.status === 0) {
    console.log(`PASS ${script}`);
    passes.push(script);
  } else {
    const tail = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim().split("\n").slice(-2).join(" | ");
    console.log(`FAIL ${script} → ${tail}`);
    fails.push(script);
  }
}

console.log(`\n--- SUMMARY: ${passes.length} PASS, ${fails.length} FAIL ---`);
if (fails.length > 0) {
  console.log("FAILING GUARDS (pre-existing violations on main):");
  for (const f of fails) console.log(`  ${f}`);
}
process.exit(0);
