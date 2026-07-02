#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_FILE = path.join(ROOT, "apps/backend/src/index.ts");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/safety/driver-qualification.routes.ts");
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0267_safety_driver_dqf.sql");

function fail(message) {
  console.error(`verify:safety-driver-dqf — FAILED\n- ${message}`);
  process.exit(1);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

for (const file of [INDEX_FILE, ROUTES_FILE, MIGRATION_FILE]) {
  if (!fs.existsSync(file)) fail(`missing required file ${path.relative(ROOT, file)}`);
}

const indexSource = fs.readFileSync(INDEX_FILE, "utf8");
const routesSource = fs.readFileSync(ROUTES_FILE, "utf8");
const migrationSource = fs.readFileSync(MIGRATION_FILE, "utf8");

requirePattern(indexSource, /registerSafetyDriverQualificationRoutes/, "index must import/register driver qualification routes");
requirePattern(indexSource, /await registerSafetyDriverQualificationRoutes\(app\)/, "index must bootstrap driver qualification routes");

requirePattern(routesSource, /app\.get\("\/api\/v1\/safety\/driver-qualification\/drivers\/:driver_id\/items"/, "missing list route");
requirePattern(routesSource, /app\.post\("\/api\/v1\/safety\/driver-qualification\/items"/, "missing create route");
requirePattern(routesSource, /app\.patch\("\/api\/v1\/safety\/driver-qualification\/items\/:id"/, "missing patch route");
// Tenant scope may be set via the legacy `SET LOCAL app.operating_company_id = '...'` form OR the
// SQLi-hardened parameterized `set_config('app.operating_company_id', $1, true)` form — accept both.
requirePattern(routesSource, /(?:SET LOCAL app\.operating_company_id|set_config\(\s*['"]app\.operating_company_id['"])/, "routes must set tenant scope");
requirePattern(routesSource, /expiry_pill/, "routes must compute expiry pill");

requirePattern(migrationSource, /driver_qualification_files_status_check/, "migration must enforce status check");

console.log("verify:safety-driver-dqf — OK");
