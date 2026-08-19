#!/usr/bin/env node
/** @matrix-built {"modules":["lists"],"cols":["driver"],"leafRe":"^(hub\\.names_search|catalog\\.drivers\\.teams\\.(list|create)|lists\\.modal\\.driver_team)$","task":"LINK-F5168-LISTS-DRIVER-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical driver-column sweep (2026-08-14): 4 genuine lists leaves.
 * hub.names_search's NamesMasterHub.tsx has a real LINKABLE_NAME_KINDS["driver"]="driver" map
 * feeding a real EntityLink kind={kind} id={row.entity_id}. catalog.drivers.teams.list/create and
 * lists.modal.driver_team all share DriverTeamsPage.tsx (real primary_driver_id/secondary_driver_id
 * + EntityLink kind="driver") and DriverTeamModal.tsx (real DriverPickerWithCreate -> EntityPicker
 * kind="driver", sourced from mdata.drivers).
 *
 * CC-2 GUARD 2026-08-19: DriverTeamsPage.tsx was legitimately refactored to extract a shared
 * DriverTeamMemberCell({row, slot}) component (adds LV-LISTS-DRIVER-TEAMS-DEAD-TOMBSTONE-LINK
 * honesty — unresolved/UUID-shaped names render plain text, never a dead EntityLink). The real
 * driver_id -> EntityLink kind="driver" wiring this guard exists to protect is still fully intact
 * (confirmed by direct source read + live GUARD re-verify of the Driver Teams reverse-link, OUTBOX
 * 2026-08-18T22:30Z); only the literal source text the old 2 checks pattern-matched moved into the
 * cell component. Re-anchored to the new shape (4 checks: driverId derivation, the EntityLink call,
 * and both column call-sites) rather than weakening or deleting the guard.
 *
 * Self-test: node scripts/verify-lists-driver-search-and-teams.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lists-driver-search-and-teams";

const CHECKS = [
  ["apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", /driver: "driver",/],
  // Independently fixed by Codex-1 (c3590c164) — same guard-anchor-drift diagnosis; kept this
  // already-integrated, more general version (\s+ matches both same-line and multi-line JSX).
  ["apps/frontend/src/pages/lists/names/NamesMasterHub.tsx", /kind=\{kind\}\s+id=\{row\.entity_id\}/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", /slot === "primary" \? row\.primary_driver_id : row\.secondary_driver_id/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", /<EntityLink\s+kind="driver"\s+id=\{driverId\}/],
  ["apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", /<DriverPickerWithCreate\s*\n\s*dataField="primary_driver_id"/],
  ["apps/frontend/src/components/drivers/DriverPickerWithCreate.tsx", /<EntityPicker\s*\n\s*kind="driver"/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real driver_id/EntityLink kind="driver" wiring`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — lists' 4 driver-scoped names-search/team leaves are real`);
