#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const manifestSourcePath = path.join(repoRoot, "apps/frontend/src/router/route-manifest.ts");
const routesSourcePath = path.join(repoRoot, "apps/frontend/src/routes/manifest.tsx");

const failures = [];

if (!fs.existsSync(manifestSourcePath)) {
  console.error("[verify-route-manifest-completeness] FAIL: route-manifest.ts missing");
  process.exit(1);
}

const manifestSource = fs.readFileSync(manifestSourcePath, "utf8");
const routePaths = [...manifestSource.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]);
const routesFile = fs.readFileSync(routesSourcePath, "utf8");

for (const routePath of routePaths) {
  if (!routesFile.includes(`path="${routePath}"`)) {
    failures.push(`${routePath} (missing <Route path=...> in manifest.tsx)`);
  }
}

if (!manifestSource.includes("ROUTE_MANIFEST")) {
  failures.push("route-manifest.ts (missing ROUTE_MANIFEST export)");
}

if (failures.length > 0) {
  console.error("[verify-route-manifest-completeness] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log(`[verify-route-manifest-completeness] OK (${routePaths.length} manifest paths registered)`);
