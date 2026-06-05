#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(ROOT, "db/migrations/0380_drug_alcohol_program.sql");
const resultsPath = path.join(ROOT, "apps/backend/src/compliance/drug-alcohol-results.ts");
const routesPath = path.join(ROOT, "apps/backend/src/compliance/drug-alcohol.routes.ts");

function fail(message) {
  console.error(`verify:drug-alcohol-fmcsa-clearinghouse-link FAIL: ${message}`);
  process.exit(1);
}

for (const filePath of [migrationPath, resultsPath, routesPath]) {
  if (!fs.existsSync(filePath)) fail(`missing ${path.relative(ROOT, filePath)}`);
}

const migration = fs.readFileSync(migrationPath, "utf8");
if (!migration.includes("clearinghouse_reported_at")) fail("migration must track clearinghouse_reported_at");
if (!migration.includes("clearinghouse_pending")) fail("migration must track clearinghouse_pending");

const results = fs.readFileSync(resultsPath, "utf8");
if (!results.includes("clearinghouse_pending")) fail("results module must set clearinghouse_pending on positives");

const routes = fs.readFileSync(routesPath, "utf8");
if (!routes.includes("/api/v1/compliance/drug-alcohol/results/:id/clearinghouse")) {
  fail("routes must expose clearinghouse report endpoint");
}
if (!routes.includes("annual-rate-status")) fail("routes must expose annual-rate-status");

console.log("verify:drug-alcohol-fmcsa-clearinghouse-link PASS");
