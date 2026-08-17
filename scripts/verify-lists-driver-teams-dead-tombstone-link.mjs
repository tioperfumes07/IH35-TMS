#!/usr/bin/env node
/**
 * verify-lists-driver-teams-dead-tombstone-link.mjs
 * LV-LISTS-DRIVER-TEAMS-DEAD-TOMBSTONE-LINK
 *
 * Driver Teams primary/secondary cells must not EntityLink unresolved
 * ("Driver — not visible" / UUID-shaped) names — dead drill theater.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-lists-driver-teams-dead-tombstone-link";
const PAGE = "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx";

function read() {
  return fs.readFileSync(path.join(process.cwd(), PAGE), "utf8");
}

function analyze(src) {
  const failures = [];
  if (!/isUnresolvedEntityTombstone/.test(src)) {
    failures.push("DriverTeamsPage must use isUnresolvedEntityTombstone before EntityLink");
  }
  if (!/driver-teams-primary-tombstone|driver-teams-\$\{slot\}-tombstone/.test(src)) {
    failures.push("DriverTeamsPage must render noninteractive tombstone testids");
  }
  // Bare EntityLink on primary/secondary without tombstone gate (old defect)
  if (
    /EntityLink kind="driver" id=\{row\.primary_driver_id\}/.test(src) ||
    /EntityLink kind="driver" id=\{row\.secondary_driver_id\}/.test(src)
  ) {
    failures.push("must not EntityLink row.primary/secondary_driver_id without unresolved gate");
  }
  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const pagePath = path.join(process.cwd(), PAGE);
  const original = fs.readFileSync(pagePath, "utf8");
  try {
    const bad = original
      .replace(/isUnresolvedEntityTombstone/g, "NOT_A_TOMBSTONE_CHECK")
      .replace(
        /render: \(row\) => <DriverTeamMemberCell row=\{row\} slot="primary" \/>,/,
        'render: (row) => <EntityLink kind="driver" id={row.primary_driver_id} label={driverTeamMemberName(row, "primary")} />,',
      );
    fs.writeFileSync(pagePath, bad);
    const planted = analyze(read());
    if (!planted.length) fail(`selftest expected fail; got none`);
  } finally {
    fs.writeFileSync(pagePath, original);
  }
  const good = analyze(read());
  if (good.length) fail(`selftest expected GOOD: ${good.join("; ")}`);
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = analyze(read());
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — driver teams tombstones noninteractive`);
