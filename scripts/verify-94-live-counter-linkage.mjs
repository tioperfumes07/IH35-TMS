#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_FILES = ["apps/backend/src/reports/library.routes.ts"];

function fail(messages) {
  console.error("verify:94-live-counter-linkage — FAILED");
  for (const message of messages) {
    console.error(`- ${message}`);
  }
  process.exit(1);
}

function lineNumberAt(text, index) {
  return text.slice(0, index).split("\n").length;
}

const failures = [];

for (const relativePath of TARGET_FILES) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}:1 target file missing`);
    continue;
  }
  const text = fs.readFileSync(absolutePath, "utf8");
  const routeMatch = text.match(/app\.get\("\/api\/v1\/reports\/home-fleet-snapshot"[\s\S]*?\n  \}\);/m);
  if (!routeMatch || routeMatch.index == null) {
    failures.push(`${relativePath}:1 could not locate /api/v1/reports/home-fleet-snapshot route`);
    continue;
  }

  const routeBlock = routeMatch[0];
  const routeLine = lineNumberAt(text, routeMatch.index);
  if (!routeBlock.includes("integrations.samsara_vehicles")) {
    failures.push(`${relativePath}:${routeLine} missing integrations.samsara_vehicles counter query`);
  }
  if (!routeBlock.includes("operating_company_id")) {
    failures.push(`${relativePath}:${routeLine} missing operating_company_id filter in 94-live path`);
  }
  if (!routeBlock.includes("local_unit_id")) {
    failures.push(`${relativePath}:${routeLine} missing local_unit_id linkage filter in 94-live path`);
  }
}

if (failures.length > 0) {
  fail(failures);
}

console.log("verify:94-live-counter-linkage — OK");
