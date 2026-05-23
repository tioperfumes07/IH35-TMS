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
