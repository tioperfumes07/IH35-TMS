#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/backend/src/mdata/index.ts");
const source = fs.readFileSync(targetFile, "utf8");

if (!source.includes("registerUnitBulkUpdateRoutes")) {
  console.error("[verify-bulk-update-route-mounted] registerUnitBulkUpdateRoutes not wired in mdata/index.ts");
  process.exit(1);
}

if (!source.includes("unit-bulk-update.routes")) {
  console.error("[verify-bulk-update-route-mounted] unit-bulk-update.routes import missing in mdata/index.ts");
  process.exit(1);
}

console.log("[verify-bulk-update-route-mounted] OK");
