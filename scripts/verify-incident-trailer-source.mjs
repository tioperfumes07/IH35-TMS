#!/usr/bin/env node
// SC-TRAILER-FK — guards the incident trailer wiring against regression to the wrong parent table.
// safety.incidents.trailer_id must reference mdata.equipment (trailers live there; mdata.units is
// trucks only). Fails if: the FK-repoint migration is missing or targets mdata.units; the backend
// drops its RLS-scoped invalid_trailer existence check; or any incident creator that persists a
// trailer sources it from a units list instead of the equipment-backed unified list.
//
// Negative-tested: against pre-fix code (0345's inline `REFERENCES mdata.units`, no repoint
// migration, no invalid_trailer check) every one of these assertions fails as intended.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8");
}

const backendPath = "apps/backend/src/safety/incidents.routes.ts";
const migrationDir = "db/migrations";
const creatorsDir = "apps/frontend/src/pages/safety/components";

// ── 1) Migration: the FK repoint to mdata.equipment must exist. ──────────────────────────────
let repointFound = false;
const migAbs = path.resolve(ROOT, migrationDir);
if (fs.existsSync(migAbs)) {
  for (const file of fs.readdirSync(migAbs)) {
    if (!file.endsWith(".sql")) continue;
    const sql = fs.readFileSync(path.join(migAbs, file), "utf8");
    if (
      sql.includes("incidents_trailer_id_fkey") &&
      /REFERENCES\s+mdata\.equipment/i.test(sql) &&
      sql.includes("safety.incidents")
    ) {
      repointFound = true;
      break;
    }
  }
}
if (!repointFound) failures.push("missing_fk_repoint_migration_to_mdata_equipment");

// ── 2) Backend: RLS-scoped invalid_trailer existence check against mdata.equipment. ──────────
const backend = read(backendPath);
if (!backend) failures.push(`missing:${backendPath}`);
if (backend && !backend.includes("invalid_trailer")) failures.push("backend_missing_invalid_trailer_check");
if (backend && !/FROM\s+mdata\.equipment/i.test(backend)) failures.push("backend_trailer_check_not_against_equipment");

// ── 3) Frontend: any incident creator that persists a trailer must source it from the ─────────
//        equipment-backed unified list (listUnits include:"trailers"), never a units-only picker.
const creatorsAbs = path.resolve(ROOT, creatorsDir);
if (fs.existsSync(creatorsAbs)) {
  for (const file of fs.readdirSync(creatorsAbs)) {
    if (!file.endsWith(".tsx")) continue;
    const src = fs.readFileSync(path.join(creatorsAbs, file), "utf8");
    // Does this creator persist a trailer? (sends trailer_id in a create body)
    const persistsTrailer = /trailer_id\s*:/.test(src);
    if (!persistsTrailer) continue;
    // Must source trailers from mdata.equipment: either the legacy unified fleet list
    // (listUnits include:"trailers") OR EntityPicker kind="trailer" (listEquipment).
    const fromUnifiedList = /include\s*:\s*["']trailers["']/.test(src);
    const fromEntityPicker =
      /EntityPicker[\s\S]{0,200}kind=["']trailer["']/.test(src) ||
      /kind=["']trailer["'][\s\S]{0,200}EntityPicker/.test(src) ||
      /listEquipment\s*\(/.test(src);
    if (!fromUnifiedList && !fromEntityPicker) {
      failures.push(`creator_trailer_not_sourced_from_equipment:${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error("verify:incident-trailer-source FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:incident-trailer-source PASSED");
