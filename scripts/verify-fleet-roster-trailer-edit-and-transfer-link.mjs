#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["trailer"],"leafRe":"^(roster\\.row\\.edit_trailer|transfers\\.in_progress)$","task":"LINK-F5163-FLEET-TRAILER-EDIT-TRANSFER-LINK"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14): two real product bugs surfaced
 * during live per-leaf verification, fixed here (not just a Required-map correction):
 *   - roster.row.edit_trailer: FleetTable.tsx's row "Edit" button always opened the unit-only
 *     EditVehicleModal regardless of row.kind, so clicking Edit on a trailer row silently hit the
 *     wrong (units) endpoint. Now branches on row.kind to open EditTrailerModal for trailer rows.
 *   - transfers.in_progress: TransfersInProgressPage.tsx labeled every row "Unit:" with
 *     EntityLink kind="unit", but row.equipment_id is always sourced from mdata.equipment
 *     (trailer/chassis), never mdata.units — mislabeled on every row. Now "Trailer:" / kind="trailer".
 *
 * Self-test: node scripts/verify-fleet-roster-trailer-edit-and-transfer-link.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  fleetTable: "apps/frontend/src/components/FleetTable.tsx",
  transfers: "apps/frontend/src/pages/fleet/TransfersInProgressPage.tsx",
  transferService: "apps/backend/src/mdata/equipment-transfer.service.ts",
};
const LABEL = "verify-fleet-roster-trailer-edit-and-transfer-link";

export function audit(src) {
  const failures = [];
  if (!/<EditTrailerModal\b[\s\S]{0,300}open=\{editingUnitId !== null && editingRow\?\.kind === "trailer"\}/.test(src.fleetTable)) {
    failures.push(`${FILES.fleetTable}: roster row edit must open EditTrailerModal for trailer rows`);
  }
  if (!/<EditVehicleModal\b[\s\S]{0,200}open=\{editingUnitId !== null && editingRow\?\.kind !== "trailer"\}/.test(src.fleetTable)) {
    failures.push(`${FILES.fleetTable}: roster row edit must NOT open the unit modal for trailer rows`);
  }
  if (!/EntityLink(?:OrTombstone)? kind="trailer" id=\{row\.equipment_id\}/.test(src.transfers)) {
    failures.push(`${FILES.transfers}: transfer rows must render EntityLink kind="trailer" for equipment_id (mdata.equipment is trailer/chassis, never units)`);
  }
  if (!/e\.equipment_number/.test(src.transferService) || !/e\.owner_company_id = r\.operating_company_id OR e\.currently_leased_to_company_id = r\.operating_company_id/.test(src.transferService)) {
    failures.push(`${FILES.transferService}: transfer payload must resolve trailer number through the owning/leased company`);
  }
  if (!/AS from_driver_name/.test(src.transferService) || !/from_driver\.operating_company_id = r\.operating_company_id/.test(src.transferService) || !/AS to_driver_name/.test(src.transferService) || !/to_driver\.operating_company_id = r\.operating_company_id/.test(src.transferService)) {
    failures.push(`${FILES.transferService}: transfer payload must resolve both driver names within the transfer company`);
  }
  for (const token of [
    'name={row.equipment_number} noun="Trailer"',
    'name={row.from_driver_name} noun="Driver"',
    'name={row.to_driver_name} noun="Driver"',
  ]) if (!src.transfers.includes(token)) failures.push(`${FILES.transfers}: missing human label consumer ${token}`);
  return failures;
}

function loadSrc(root) {
  return {
    fleetTable: fs.readFileSync(path.join(root, FILES.fleetTable), "utf8"),
    transfers: fs.readFileSync(path.join(root, FILES.transfers), "utf8"),
    transferService: fs.readFileSync(path.join(root, FILES.transferService), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["edit-trailer-branch", "fleetTable", /open=\{editingUnitId !== null && editingRow\?\.kind === "trailer"\}/, 'open={false}'],
    ["edit-vehicle-branch", "fleetTable", /open=\{editingUnitId !== null && editingRow\?\.kind !== "trailer"\}/, 'open={editingUnitId !== null}'],
    ["transfer-entitylink", "transfers", /EntityLink(?:OrTombstone)? kind="trailer" id=\{row\.equipment_id\}/, 'EntityLink kind="unit" id={row.equipment_id}'],
    ["equipment-scope", "transferService", /e\.owner_company_id = r\.operating_company_id OR e\.currently_leased_to_company_id = r\.operating_company_id/, "TRUE"],
    ["driver-scope", "transferService", /from_driver\.operating_company_id = r\.operating_company_id/, "TRUE"],
    ["human-label", "transfers", /row\.to_driver_name/, "null"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — roster trailer-row edit opens the real trailer modal; transfer rows label real trailer EntityLinks`);
