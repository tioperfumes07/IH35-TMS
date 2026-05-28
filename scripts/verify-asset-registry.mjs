#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIGRATION_FILE = path.join(ROOT, "db/migrations/0262_asset_registry.sql");
const ROUTES_FILE = path.join(ROOT, "apps/backend/src/assets/assets.routes.ts");

function fail(message) {
  console.error(`verify:asset-registry — FAILED\n- ${message}`);
  process.exit(1);
}

function requirePattern(text, pattern, message) {
  if (!pattern.test(text)) fail(message);
}

if (!fs.existsSync(MIGRATION_FILE)) fail("missing migration db/migrations/0262_asset_registry.sql");
if (!fs.existsSync(ROUTES_FILE)) fail("missing routes file apps/backend/src/assets/assets.routes.ts");

const migration = fs.readFileSync(MIGRATION_FILE, "utf8");
const routes = fs.readFileSync(ROUTES_FILE, "utf8");

requirePattern(migration, /CREATE TABLE IF NOT EXISTS mdata\.assets/i, "migration must create mdata.assets");
requirePattern(migration, /tenant_id UUID NOT NULL/i, "mdata.assets must include tenant_id");
requirePattern(migration, /unit_code TEXT NOT NULL/i, "mdata.assets must include non-null unit_code");
requirePattern(
  migration,
  /asset_type TEXT NOT NULL[\s\S]*tractor[\s\S]*dry_van[\s\S]*reefer[\s\S]*flatbed[\s\S]*personnel_vehicle[\s\S]*other/i,
  "asset_type enum/check must include required values"
);
requirePattern(
  migration,
  /status TEXT NOT NULL DEFAULT 'active'[\s\S]*active[\s\S]*damaged[\s\S]*idle[\s\S]*in_repair[\s\S]*sold[\s\S]*retired/i,
  "status enum/check must include required values"
);
requirePattern(migration, /UNIQUE\s*\(\s*tenant_id\s*,\s*unit_code\s*\)/i, "must enforce tenant/unit_code uniqueness");
requirePattern(migration, /INSERT INTO mdata\.assets[\s\S]*FROM mdata\.units/i, "migration must backfill from mdata.units");

requirePattern(routes, /app\.get\("\/api\/v1\/assets"/, "routes must define GET /api/v1/assets");
requirePattern(routes, /app\.get\("\/api\/v1\/assets\/:id"/, "routes must define GET /api/v1/assets/:id");
requirePattern(routes, /app\.post\("\/api\/v1\/assets"/, "routes must define POST /api/v1/assets");
requirePattern(routes, /app\.patch\("\/api\/v1\/assets\/:id"/, "routes must define PATCH /api/v1/assets/:id");
requirePattern(routes, /tenant_id = \$1|AND tenant_id = \$2/, "routes must scope queries by tenant_id");
requirePattern(routes, /resolveOperatingCompanyId|assertCompanyMembership/, "routes must resolve + enforce company scope");

console.log("verify:asset-registry — OK");
