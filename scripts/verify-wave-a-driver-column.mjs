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

const targeted = [
  ["apps/frontend/src/pages/safety/photo-comparison/PhotoComparisonPage.tsx", /<EntityLink kind="driver" id=\{session\.driver_uuid\}/],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage.tsx", /<EntityLink kind="driver" id=\{String\(req\.driver_id/],
  ["apps/frontend/src/pages/driver-finance/OwnerApprovalPortalPage.tsx", /<EntityLink kind="driver" id=\{String\(req\?\.driver_id/],
  ["apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", /<EntityLink kind="driver" id=\{u\.driver_id\}/],
  ["apps/frontend/src/pages/safety/tabs/EscrowRecordTab.tsx", /<EntityLink kind="driver" id=\{entry\.driver_id\}/],
];
const failures = [];
for (const [file, required] of targeted) {
  const src = fs.readFileSync(file, "utf8");
  if (!required.test(src)) failures.push(`${file}: canonical driver EntityLink missing`);
}

const forbidden = [
  /entityLabel\(\s*(?:session|entry|row)\.driver_name\s*,\s*null\s*,\s*["']Driver["']\s*\)/,
  /<span[^>]*>\{entityLabel\(u\.driver_name,\s*u\.driver_id,\s*["']Driver["']\)\}<\/span>/,
];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  for (const pattern of forbidden) if (pattern.test(src)) failures.push(`${file}: driver FK is discarded or label is not linked`);
}

if (failures.length) {
  console.error(`verify-wave-a-driver-column FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`verify-wave-a-driver-column PASS — ${files.length} production TSX files scanned; vertical driver links ratcheted`);
