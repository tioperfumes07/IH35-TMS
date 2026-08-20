#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch","safety"],"cols":["driver"],"leafRe":"^(queues\\.trip_pairing|escrow_record\\.list|driver_scheduler\\.list)$","task":"WAVE-A-driver-exact-surfaces","vertical":"column-wave"} */
import fs from "node:fs";
import path from "node:path";

const roots = ["apps/frontend/src/pages", "apps/frontend/src/components"];
const files = [];
for (const root of roots) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) files.push(full);
    }
  };
  walk(root);
}

const required = [
  ["photo comparison driver drill", "apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx", /<EntityLink kind="driver" id=\{session\.driver_uuid\}/],
  // CC-2 GUARD 2026-08-19: re-anchored — this surface now uses the EntityLinkOrTombstone honesty
  // wrapper (renders plain text for a null/unresolved driver instead of a dead EntityLink) around
  // the same real kind="driver" id={String(req.driver_id...)} wiring, not a bare EntityLink anymore.
  ["scheduler request driver drill", "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage.tsx", /<EntityLink(?:OrTombstone)? kind="driver" id=\{String\(req\.driver_id/],
  ["owner approval driver drill", "apps/frontend/src/pages/driver-finance/OwnerApprovalPortalPage.tsx", /<EntityLink kind="driver" id=\{String\(req\?\.driver_id/],
  // Same re-anchor as scheduler request above: TripPairingBoardPage now wraps this in
  // EntityLinkOrTombstone (honest null/unresolved-driver fallback) around the same real
  // kind="driver" id={u.driver_id} wiring, not a bare EntityLink.
  ["trip pairing driver drill", "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", /<EntityLink(?:OrTombstone)? kind="driver" id=\{u\.driver_id\}/],
  ["escrow record driver drill", "apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx", /<EntityLink kind="driver" id=\{entry\.driver_id\}/],
];
const forbidden = [
  ["driver FK discarded from generic row", /entityLabel\(\s*(?:session|entry|row)\.driver_name\s*,\s*null\s*,\s*["']Driver["']\s*\)/],
  ["trip pairing driver label not linked", /<span[^>]*>\{entityLabel\(u\.driver_name,\s*u\.driver_id,\s*["']Driver["']\)\}<\/span>/],
];
const original = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));

function audit(sources) {
  const failures = [];
  for (const [name, file, pattern] of required) {
    if (!pattern.test(sources.get(file) ?? "")) failures.push(name);
  }
  for (const [name, pattern] of forbidden) {
    if ([...sources.values()].some((source) => pattern.test(source))) failures.push(name);
  }
  return failures;
}

const failures = audit(original);
if (failures.length) {
  console.error(`verify-wave-a-driver-column FAIL:\n${failures.map((failure) => ` - ${failure}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, file, pattern] of required) {
    const mutated = new Map(original);
    mutated.set(file, original.get(file).replace(pattern, "__PLANTED_DRIVER_LINK_DEFECT__"));
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  const injectionFile = required[0][1];
  const forbiddenSamples = [
    'entityLabel(row.driver_name, null, "Driver")',
    '<span>{entityLabel(u.driver_name, u.driver_id, "Driver")}</span>',
  ];
  forbidden.forEach(([name], index) => {
    const mutated = new Map(original);
    mutated.set(injectionFile, `${original.get(injectionFile)}\n${forbiddenSamples[index]}`);
    if (audit(mutated).includes(name)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  });
  console.log(`verify-wave-a-driver-column SELFTEST PASS — ${caught}/${required.length + forbidden.length} exact driver mutations detected`);
  process.exit(0);
}

console.log(`verify-wave-a-driver-column PASS — ${files.length} production TSX files scanned; vertical driver links ratcheted`);
