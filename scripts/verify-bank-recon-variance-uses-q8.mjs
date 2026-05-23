#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const routesPath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts");
const servicePath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts");
const matchServicePath = path.join(repoRoot, "apps/backend/src/accounting/bank-recon/match.service.ts");

function fail(messages) {
  console.error("verify:bank-recon-variance-uses-q8 — FAILED");
  for (const message of messages) console.error(`- ${message}`);
  process.exit(1);
}

const failures = [];
for (const target of [routesPath, servicePath, matchServicePath]) {
  if (!fs.existsSync(target)) failures.push(`missing ${path.relative(repoRoot, target)}`);
}

if (failures.length === 0) {
  const routesSource = fs.readFileSync(routesPath, "utf8");
  const serviceSource = fs.readFileSync(servicePath, "utf8");
  const matchSource = fs.readFileSync(matchServicePath, "utf8");

  if (!/variance_account_id/.test(routesSource)) {
    failures.push("accept/manual match routes must accept variance_account_id for Q8 handling");
  }
  if (!/variance_account_id_required/.test(serviceSource)) {
    failures.push("service must enforce variance account requirement when variance exists");
  }
  if (!/@decision Q8/.test(matchSource) || !/acceptMatchWithResolveDifference/.test(serviceSource)) {
    failures.push("variance posting flow must use Q8 resolve-difference path");
  }
}

if (failures.length > 0) fail(failures);
console.log("verify:bank-recon-variance-uses-q8 — OK");
