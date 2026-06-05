#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const routesSourcePath = path.join(repoRoot, "apps/frontend/src/routes/manifest.tsx");

const DEEP_LINK_PATHS = [
  "/banking/transactions",
  "/maintenance/work-orders",
  "/dispatch/loads",
];

const failures = [];
const routesFile = fs.readFileSync(routesSourcePath, "utf8");

function findExactRouteBlock(source, routePath) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`path="${escaped}"(?!/)`));
  if (!match || match.index == null) return null;
  return source.slice(match.index, match.index + 400);
}

for (const routePath of DEEP_LINK_PATHS) {
  const snippet = findExactRouteBlock(routesFile, routePath);
  if (!snippet) {
    failures.push(`${routePath} (route block not found)`);
    continue;
  }
  if (snippet.includes('Navigate to="/home"')) {
    failures.push(`${routePath} (silent redirect to /home)`);
  }
  if (routePath === "/banking/transactions" && !snippet.includes("BankingHomePage")) {
    failures.push(`${routePath} (must render BankingHomePage)`);
  }
  if (routePath === "/maintenance/work-orders" && !snippet.includes("WorkOrdersConsoleListPage")) {
    failures.push(`${routePath} (must render WorkOrdersConsoleListPage)`);
  }
  if (routePath === "/dispatch/loads" && !snippet.includes("DispatchLoadsRoute") && !snippet.includes("DispatchPage")) {
    failures.push(`${routePath} (must render dispatch loads surface)`);
  }
}

const bankingHomePath = path.join(repoRoot, "apps/frontend/src/pages/banking/BankingHome.tsx");
const bankingHome = fs.readFileSync(bankingHomePath, "utf8");
if (!bankingHome.includes("route-manifest") && !bankingHome.includes("bankingTabFromPath")) {
  failures.push("BankingHome.tsx (must sync tabs from route manifest paths)");
}

if (failures.length > 0) {
  console.error("[verify-no-silent-redirects] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-no-silent-redirects] OK (${DEEP_LINK_PATHS.length} deep links guarded)`);
