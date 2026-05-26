#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_WO_DISPLAY_ID_ROOT ?? process.cwd();
const routePath =
  process.env.VERIFY_WO_DISPLAY_ID_ROUTE_PATH ??
  path.join(ROOT, "apps/backend/src/maintenance/work-orders.routes.ts");
const migrationPath =
  process.env.VERIFY_WO_DISPLAY_ID_MIGRATION_PATH ??
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
    { id: "source-type-enum", pattern: /source_type:\s*z\.enum\(\["IS",\s*"ES",\s*"AC",\s*"ET",\s*"RT",\s*"IT",\s*"RS"\]\)/ },
    { id: "display-id-function-call", pattern: /maintenance\.next_wo_display_id\(/ },
    { id: "display-id-column", pattern: /display_id/ },
  ];
  for (const check of routeChecks) {
    if (!check.pattern.test(routeSource)) failures.push(`missing_route_pattern:${check.id}`);
  }

  const migrationChecks = [
    { id: "display-id-prefix", pattern: /'WO-'/ },
    { id: "date-fragment", pattern: /TO_CHAR\(COALESCE\(p_date,\s*CURRENT_DATE\),\s*'MM-DD-YYYY'\)/ },
    { id: "sequence-fragment", pattern: /LPAD\(v_seq::text,\s*4,\s*'0'\)/ },
    { id: "pending-v5-fragment", pattern: /'-PEND0'/ },
    { id: "v5-suffix-refresh", pattern: /maintenance\.compute_v5_suffix/ },
  ];
  for (const check of migrationChecks) {
    if (!check.pattern.test(migrationSource)) failures.push(`missing_migration_pattern:${check.id}`);
  }

  if (failures.length > 0) {
    console.error("verify:wo-display-id-format FAILED");
    for (const failure of failures) console.error(` - ${failure}`);
    process.exit(1);
  }

  console.log("verify:wo-display-id-format OK");
}

main();
