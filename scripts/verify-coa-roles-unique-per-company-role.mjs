#!/usr/bin/env node

/**
 * ACCT-COA-ROLE-UNIQUE: active CoA role resolution is database-unique per company+role.
 * Independent anchors: claimed migration DDL, migration-runner transaction policy, and the sole
 * non-test application writer's deactivate-then-insert lifecycle.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const migrationPath = "db/migrations/202613300800_coa_roles_unique_per_company_role.sql";
const runnerPath = "scripts/db-migrate.mjs";
const routePath = "apps/backend/src/accounting/coa-roles/routes.ts";

const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

function problems({ migration, runner, route, runtimeInsertFiles }) {
  const found = [];
  if (!/^\s*--\s*IH35_MIGRATION_NO_TRANSACTION\b/m.test(migration)) {
    found.push("claimed migration lacks the explicit no-transaction marker required by CONCURRENTLY");
  }
  if (!/CREATE\s+UNIQUE\s+INDEX\s+CONCURRENTLY\s+IF\s+NOT\s+EXISTS\s+uq_coa_roles_company_role_active/i.test(migration)) {
    found.push("claimed migration lacks the named concurrent unique index");
  }
  if (!/ON\s+accounting\.chart_of_accounts_roles\s*\(\s*operating_company_id\s*,\s*role\s*\)\s*WHERE\s+is_active\s*;/i.test(migration)) {
    found.push("index is not the exact partial (operating_company_id, role) WHERE is_active invariant");
  }
  if (!/const noTransaction = .*IH35_MIGRATION_NO_TRANSACTION/.test(runner) || !/if \(noTransaction \|\| hasExplicitTx\)/.test(runner)) {
    found.push("migration runner does not honor the explicit no-transaction marker");
  }
  if (runtimeInsertFiles.length !== 1 || runtimeInsertFiles[0] !== routePath) {
    found.push(`unexpected runtime chart_of_accounts_roles writer set: ${runtimeInsertFiles.join(", ") || "none"}`);
  }
  const deactivate = route.indexOf("UPDATE accounting.chart_of_accounts_roles");
  const insert = route.indexOf("INSERT INTO accounting.chart_of_accounts_roles", deactivate + 1);
  if (deactivate < 0 || insert < 0 || deactivate > insert) {
    found.push("runtime writer no longer deactivates the current role before inserting its replacement");
  }
  const lifecycle = deactivate >= 0 && insert >= 0 ? route.slice(deactivate, insert) : "";
  if (!/WHERE operating_company_id = \$1::uuid\s+AND role = \$2\s+AND is_active = true/s.test(lifecycle)) {
    found.push("runtime replacement deactivation is not scoped to the active company+role binding");
  }
  return found;
}

function runtimeWriters() {
  const base = path.join(root, "apps/backend/src");
  const writers = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") walk(absolute);
      } else if (/\.(?:ts|mts|js|mjs)$/.test(entry.name)) {
        const relative = path.relative(root, absolute);
        if (!/\.test\./.test(entry.name) && read(relative).includes("INSERT INTO accounting.chart_of_accounts_roles")) writers.push(relative);
      }
    }
  };
  walk(base);
  return writers.sort();
}

const source = {
  migration: read(migrationPath),
  runner: read(runnerPath),
  route: read(routePath),
  runtimeInsertFiles: runtimeWriters(),
};
const baseline = problems(source);
if (baseline.length) {
  console.error(`verify-coa-roles-unique-per-company-role: FAIL\n- ${baseline.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["partial unique index removed", { ...source, migration: source.migration.replace("CREATE UNIQUE INDEX CONCURRENTLY", "CREATE INDEX CONCURRENTLY") }],
    ["runtime replacement deactivation unscoped", { ...source, route: source.route.replace("AND is_active = true", "AND is_active = false") }],
  ];
  const survivors = mutations.filter(([, mutated]) => problems(mutated).length === 0).map(([name]) => name);
  if (survivors.length) {
    console.error(`verify-coa-roles-unique-per-company-role: SELFTEST FAIL — surviving mutations: ${survivors.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-coa-roles-unique-per-company-role: SELFTEST PASS — ${mutations.length}/${mutations.length} mutations rejected`);
  process.exit(0);
}

console.log("verify-coa-roles-unique-per-company-role: PASS — active company+role bindings are partial-unique and the sole runtime writer replaces safely");
