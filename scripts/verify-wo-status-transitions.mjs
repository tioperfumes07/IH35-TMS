#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_WO_STATUS_ROOT ?? process.cwd();
const routePath =
  process.env.VERIFY_WO_STATUS_ROUTE_PATH ??
  path.join(ROOT, "apps/backend/src/maintenance/work-orders.routes.ts");
const migrationPath =
  process.env.VERIFY_WO_STATUS_MIGRATION_PATH ??
  path.join(ROOT, "db/migrations/0049_p3_t11_6_1_wo_format_vendor_inventory_integrity.sql");

function readIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function main() {
  const failures = [];
  const routeSource = readIfExists(routePath);
  const migrationSource = readIfExists(migrationPath);

  const routeChecks = [
    { id: "allowed-transitions-object", pattern: /const allowedTransitions:\s*Record/ },
    { id: "open-to-in-progress", pattern: /open:\s*\[\s*"in_progress"/ },
    { id: "open-to-cancelled", pattern: /open:\s*\[\s*"in_progress",\s*"cancelled"\s*\]/ },
    { id: "in-progress-to-complete", pattern: /in_progress:\s*\[\s*"waiting_parts",\s*"complete",\s*"cancelled"\s*\]/ },
    { id: "complete-terminal", pattern: /complete:\s*\[\s*\]/ },
  ];
  for (const check of routeChecks) {
    if (!check.pattern.test(routeSource)) failures.push(`missing_route_pattern:${check.id}`);
  }

  const migrationChecks = [
    { id: "completion-trigger-function", pattern: /CREATE OR REPLACE FUNCTION maintenance\.enforce_wo_completion_invariants/ },
    { id: "completion-trigger", pattern: /CREATE TRIGGER trg_enforce_wo_completion_invariants/ },
    { id: "before-update-trigger", pattern: /BEFORE UPDATE ON maintenance\.work_orders/ },
  ];
  for (const check of migrationChecks) {
    if (!check.pattern.test(migrationSource)) failures.push(`missing_migration_pattern:${check.id}`);
  }

  if (failures.length > 0) {
    console.error("verify:wo-status-transitions FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:wo-status-transitions OK");
}

main();
