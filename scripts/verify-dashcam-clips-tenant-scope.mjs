#!/usr/bin/env node
import fs from "node:fs";

const routeFile = "apps/backend/src/telematics/dashcam-on-demand.routes.ts";
const migrationFile = "db/migrations/0232_cap11_dashcam_clips.sql";
const routeSrc = fs.readFileSync(routeFile, "utf8");
const migrationSrc = fs.readFileSync(migrationFile, "utf8");

const routeRequired = [
  "SET LOCAL app.operating_company_id",
  "operating_company_id: z.string().uuid()",
  "WHERE operating_company_id = $1::uuid",
];
const migrationRequired = [
  "CREATE TABLE IF NOT EXISTS telematics.dashcam_clips",
  "operating_company_id uuid NOT NULL",
  "CREATE POLICY dashcam_clips_company_scope",
];

const missing = [
  ...routeRequired.filter((s) => !routeSrc.includes(s)).map((s) => `route: ${s}`),
  ...migrationRequired.filter((s) => !migrationSrc.includes(s)).map((s) => `migration: ${s}`),
];

if (missing.length > 0) {
  console.error("verify-dashcam-clips-tenant-scope failed");
  for (const item of missing) console.error(`  missing ${item}`);
  process.exit(1);
}

console.log("verify-dashcam-clips-tenant-scope: ok");
