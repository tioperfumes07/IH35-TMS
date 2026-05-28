#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const INDEX_FILE = path.join(ROOT, "apps/backend/src/index.ts");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/safety/medical-cards.routes.ts");
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0268_safety_medical_cards_dispatch2.sql");

function fail(message) {
  console.error(`verify:safety-medical-cards — FAILED\n- ${message}`);
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

requirePattern(indexSource, /registerSafetyMedicalCardsRoutes/, "index must import/register medical card routes");
requirePattern(indexSource, /await registerSafetyMedicalCardsRoutes\(app\)/, "index must bootstrap medical card routes");

requirePattern(routesSource, /app\.get\("\/api\/v1\/safety\/medical-cards\/drivers\/:driver_id"/, "missing list route");
requirePattern(routesSource, /app\.post\("\/api\/v1\/safety\/medical-cards"/, "missing create route");
requirePattern(routesSource, /app\.patch\("\/api\/v1\/safety\/medical-cards\/:id"/, "missing patch route");
requirePattern(routesSource, /SET LOCAL app\.operating_company_id/, "routes must set tenant scope");
requirePattern(routesSource, /expiry_pill/, "routes must compute expiry pill");

requirePattern(migrationSource, /idx_medical_cards_tenant_driver_active/, "migration must add active driver index");

console.log("verify:safety-medical-cards — OK");
