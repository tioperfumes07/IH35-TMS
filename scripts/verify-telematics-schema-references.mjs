#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const telematicsDir = path.join(root, "apps", "backend", "src", "telematics");

const validUnitsColumns = new Set([
  "id",
  "unit_number",
  "vin",
  "make",
  "model",
  "year",
  "license_plate",
  "license_state",
  "status",
  "assigned_driver_id",
  "owner_company_id",
  "currently_leased_to_company_id",
  "acquired_date",
  "disposed_date",
  "notes",
  "qbo_vendor_id",
  "qbo_class_id",
  "samsara_vehicle_id",
  "created_at",
  "updated_at",
  "deactivated_at",
  "created_by_user_id",
  "updated_by_user_id",
  // Repointed (ROUND 443.187) — columns added to mdata.units after this list was written
  // (996703e135); both present on prod (information_schema, 2026-10-17):
  "ctpat_status", // db/migrations/0295_vehicle_profile_part1.sql — 15936622a6 VEHICLE-PROFILE-PART-1 (#362)
  "is_sample_data", // db/migrations/0403_onboarding_state.sql — 07fdc1790d CLOSURE-24 sample data (#582)
]);

/**
 * A `u.` on a line that binds `u` as a JS arrow parameter (`(u) => u.fleetClass`, live-fleet.ts
 * filtering in-memory unit objects) is a TypeScript property access, not SQL. Every other `u.x`
 * in a file that aliases `mdata.units u` is still checked against the column list.
 */
function isJsArrowParamAccess(source, index) {
  const lineStart = source.lastIndexOf("\n", index) + 1;
  const before = source.slice(lineStart, index);
  return /(?:\(\s*u\s*(?::[^)]*)?\)|\bu)\s*=>/.test(before);
}

function walkTsFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...walkTsFiles(full));
      continue;
    }
    if (ent.isFile() && full.endsWith(".ts")) out.push(full);
  }
  return out;
}

const failures = [];

for (const filePath of walkTsFiles(telematicsDir)) {
  const source = fs.readFileSync(filePath, "utf8");
  if (!source.includes("mdata.units u")) continue;

  const refs = source.matchAll(/\bu\.([a-zA-Z_][a-zA-Z0-9_]*)\b/g);
  for (const match of refs) {
    const column = match[1];
    if (isJsArrowParamAccess(source, match.index)) continue;
    if (!validUnitsColumns.has(column)) {
      failures.push({ filePath, column });
    }
  }
}

if (failures.length > 0) {
  console.error("verify-telematics-schema-references failed");
  for (const f of failures) {
    const rel = path.relative(root, f.filePath).split(path.sep).join("/");
    console.error(`  invalid mdata.units column reference in telematics query path: u.${f.column} (${rel})`);
  }
  process.exit(1);
}

console.log("verify-telematics-schema-references: ok");
