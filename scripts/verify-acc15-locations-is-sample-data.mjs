#!/usr/bin/env node
/**
 * ACC-15 (docs/bus/OWNER-DEFECT-REGISTER-2026-09-03.md) — "is_sample_data is not set by the
 * create paths." Live-confirmed 2026-09-08 (information_schema, prod tiny-field-89581227):
 * mdata.locations had NO is_sample_data column at all, unlike its sibling reference tables
 * (drivers, vendors, units, accounts) which already carry it. Fixed by an additive migration
 * (202614000000) plus wiring locations.routes.ts's create route to accept an explicit caller
 * value or auto-derive one from the location name (same G1 pattern vendors.routes.ts already
 * uses) -- going forward only, no backfill of the 31 existing rows (none of them are test
 * fixtures; there is nothing to backfill true).
 *
 * Usage: node scripts/verify-acc15-locations-is-sample-data.mjs
 *        node scripts/verify-acc15-locations-is-sample-data.mjs --selftest
 */
import fs from "node:fs";

const LABEL = "verify-acc15-locations-is-sample-data";
const ROUTE_PATH = "apps/backend/src/mdata/locations.routes.ts";
const MIGRATION_PATH = "db/migrations/202614000000_mdata_locations_is_sample_data.sql";

export function checkRoute(routeSrc) {
  const errors = [];
  if (!/import\s*\{\s*looksLikeSampleDataName\s*\}\s*from\s*"\.\/sample-data-name-detection\.js"/.test(routeSrc)) {
    errors.push("locations.routes.ts no longer imports looksLikeSampleDataName from ./sample-data-name-detection.js");
  }
  if (!/is_sample_data:\s*z\.boolean\(\)\.optional\(\)/.test(routeSrc)) {
    errors.push("createLocationBodySchema no longer accepts an is_sample_data field");
  }
  const insertMatch = routeSrc.match(/INSERT INTO mdata\.locations \([\s\S]*?\)\s*VALUES/);
  if (!insertMatch || !/is_sample_data/.test(insertMatch[0])) {
    errors.push("the create INSERT column list no longer includes is_sample_data");
  }
  if (!/b\.is_sample_data\s*\?\?\s*\(looksLikeSampleDataName\(b\.name\)/.test(routeSrc)) {
    errors.push("the bound value no longer prefers an explicit caller value over the name-derived default");
  }
  return errors;
}

function check(routeSrc, migrationExists) {
  const errors = checkRoute(routeSrc);
  if (!migrationExists) errors.push(`${MIGRATION_PATH} not found`);
  if (errors.length) throw new Error(errors.join("; "));
}

const routeSrc = fs.readFileSync(ROUTE_PATH, "utf8");
const migrationExists = fs.existsSync(MIGRATION_PATH);

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    routeSrc.replace('import { looksLikeSampleDataName } from "./sample-data-name-detection.js";\n', ""),
    routeSrc.replace("is_sample_data: z.boolean().optional(),\n", ""),
    routeSrc.replace(
      "              phone, security_instructions, dock_instructions, parking_instructions, notes, created_by_user_id, updated_by_user_id,\n              is_sample_data\n",
      "              phone, security_instructions, dock_instructions, parking_instructions, notes, created_by_user_id, updated_by_user_id\n"
    ),
    routeSrc.replace(
      "b.is_sample_data ?? (looksLikeSampleDataName(b.name) || false)",
      "looksLikeSampleDataName(b.name)"
    ),
  ];
  for (const mutated of mutations) {
    if (mutated === routeSrc) throw new Error("a mutation was a no-op (pattern did not match source)");
    try {
      check(mutated, migrationExists);
    } catch {
      caught += 1;
      continue;
    }
    throw new Error("a mutation escaped detection");
  }
  // Missing-migration check (independent of the route mutations above).
  try {
    check(routeSrc, false);
    throw new Error("a mutation escaped detection");
  } catch (err) {
    if (!/not found/.test(String(err.message))) throw err;
    caught += 1;
  }
  check(routeSrc, migrationExists);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length + 1} planted defects caught)`);
} else {
  check(routeSrc, migrationExists);
  console.log(`${LABEL} PASS -- mdata.locations create route accepts+writes is_sample_data (explicit or name-derived)`);
}
