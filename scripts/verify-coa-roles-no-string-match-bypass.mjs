#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const resolverPath = path.join(repoRoot, "apps/backend/src/accounting/coa-roles/resolver.service.ts");
const routesPath = path.join(repoRoot, "apps/backend/src/accounting/coa-roles/routes.ts");
const migrationPath = path.join(repoRoot, "db/migrations/0223_block_35_chart_of_accounts_roles.sql");
const postingEnginePath = path.join(repoRoot, "apps/backend/src/accounting/posting-engine.service.ts");
const trialBalanceRoutePath = path.join(repoRoot, "apps/backend/src/accounting/trial-balance.routes.ts");
const balanceSheetRoutePath = path.join(repoRoot, "apps/backend/src/accounting/balance-sheet.routes.ts");

function fail(messages) {
  console.error("verify:coa-roles-no-string-match-bypass — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];

for (const required of [resolverPath, routesPath, migrationPath]) {
  if (!fs.existsSync(required)) {
    failures.push(`missing ${path.relative(repoRoot, required)}`);
  }
}

// Control accounts (A/R, A/P) must FAIL CLOSED: the resolver may never silently pick one of several
// account_subtype matches (root cause of the GUARD Module 15 invoice A/R mis-post). Lock that in so the
// loose-fallback regression can't return.
if (fs.existsSync(resolverPath)) {
  const resolver = fs.readFileSync(resolverPath, "utf8");
  if (!/CONTROL_ROLES/.test(resolver)) {
    failures.push("resolver must define CONTROL_ROLES (fail-closed control-account set incl. ar_control/ap_control)");
  }
  if (!/ControlAccountDesignationError/.test(resolver)) {
    failures.push("resolver must throw ControlAccountDesignationError on ambiguous control accounts (fail-closed)");
  }
  if (!/_account_not_uniquely_designated/.test(resolver)) {
    failures.push("resolver must surface *_account_not_uniquely_designated for ambiguous control accounts");
  }
  for (const controlRole of ['"ar_control"', '"ap_control"']) {
    if (!resolver.includes(controlRole)) {
      failures.push(`resolver CONTROL_ROLES must include ${controlRole}`);
    }
  }
}

if (fs.existsSync(postingEnginePath)) {
  const postingEngine = fs.readFileSync(postingEnginePath, "utf8");
  if (!/resolveRoleAccountOptional/.test(postingEngine)) {
    failures.push("posting-engine must use coa role resolver");
  }
  if (/AccountsReceivable|AccountsPayable|UndepositedFunds/.test(postingEngine)) {
    failures.push("posting-engine should not hardcode AR/AP/undeposited subtype string matching");
  }
  if (/account_name ILIKE '%cash%'|account_name ILIKE '%bank%'|account_name ILIKE '%checking%'/.test(postingEngine)) {
    failures.push("posting-engine should not hardcode cash name matching");
  }
}

for (const routePath of [trialBalanceRoutePath, balanceSheetRoutePath]) {
  if (!fs.existsSync(routePath)) continue;
  const routeSource = fs.readFileSync(routePath, "utf8");
  if (!/resolveRoleAccountOptional/.test(routeSource)) {
    failures.push(`${path.relative(repoRoot, routePath)} must resolve AR/AP role accounts for cash-basis transform`);
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:coa-roles-no-string-match-bypass — OK");
