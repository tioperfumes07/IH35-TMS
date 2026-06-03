#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/backend/src/index.ts");
const routesFile = path.join(repoRoot, "apps/backend/src/telematics/driver-day-summary.routes.ts");
const indexSource = fs.readFileSync(targetFile, "utf8");
const routesSource = fs.readFileSync(routesFile, "utf8");

if (!indexSource.includes("registerDriverDaySummaryRoutes")) {
  console.error("[verify-driver-day-summary-route-mounted] registerDriverDaySummaryRoutes not wired in index.ts");
  process.exit(1);
}

if (!indexSource.includes("driver-day-summary.routes")) {
  console.error("[verify-driver-day-summary-route-mounted] driver-day-summary.routes import missing in index.ts");
  process.exit(1);
}

if (!routesSource.includes('app.get("/api/v1/telematics/driver-day-summary"')) {
  console.error("[verify-driver-day-summary-route-mounted] GET /api/v1/telematics/driver-day-summary route missing");
  process.exit(1);
}

console.log("[verify-driver-day-summary-route-mounted] OK");
