#!/usr/bin/env node
/**
 * WAVE-B dispatch connectivity remainder — hops, queues, docs, settings mounts + drills.
 *
 * @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":"^(secondary\\.(settlements|pre_settlements)$|queues\\.(border|alerts|live_map|map|trip_pairing|factoring|factoring_queue)$|planning\\.(templates|unassigned)$|docs\\.(pod|ocr|equipment_transfers)$|settings\\.(dispatch|notify)$|misc\\.(geofence_history|chat|layover)$)","task":"WAVE-B-dispatch-connectivity-remainder","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-dispatch-connectivity-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-dispatch-connectivity-remainder";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const CHECKS = [
  { name: "settlements hop → driver-finance", file: MANIFEST, pattern: /PreserveSearchNavigate to="\/driver-finance\/settlements"/ },
  { name: "dispatch settlements secondary mount", file: MANIFEST, pattern: /path="\/dispatch\/settlements"[\s\S]*subTab="settlements"/ },
  { name: "dispatch pre-settlements secondary mount", file: MANIFEST, pattern: /path="\/dispatch\/pre-settlements"[\s\S]*subTab="pre_settlements"/ },
  { name: "border crossing wizard route", file: MANIFEST, pattern: /path="\/dispatch\/border-crossing"/ },
  { name: "dispatch alerts route", file: MANIFEST, pattern: /path="\/dispatch\/alerts"/ },
  { name: "live map / geofencing route", file: MANIFEST, pattern: /path="\/dispatch\/geofencing"/ },
  { name: "map view route", file: MANIFEST, pattern: /path="\/dispatch\/map"/ },
  { name: "trip pairing route", file: MANIFEST, pattern: /path="\/dispatch\/trip-pairing"/ },
  { name: "factoring queue route", file: MANIFEST, pattern: /path="\/dispatch\/factoring-queue"/ },
  { name: "POD review route", file: MANIFEST, pattern: /path="\/dispatch\/pod-review"/ },
  { name: "OCR queue route", file: MANIFEST, pattern: /path="\/dispatch\/ocr-queue"/ },
  { name: "equipment transfers route", file: MANIFEST, pattern: /path="\/dispatch\/equipment-transfers"/ },
  { name: "notify preferences route", file: MANIFEST, pattern: /path="\/dispatch\/notify-preferences"/ },
  { name: "geofence history route", file: MANIFEST, pattern: /path="\/dispatch\/borders\/geofence-history"/ },
  { name: "dispatch chat route", file: MANIFEST, pattern: /path="\/dispatch\/chat"/ },
  { name: "driver layover route", file: MANIFEST, pattern: /path="\/dispatch\/layovers\/driver\/:driverId"/ },
  { name: "factoring queue EntityLink drills", file: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx", pattern: /EntityLink/ },
  { name: "trip pairing EntityLink drills", file: "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", pattern: /EntityLink/ },
  { name: "POD review EntityLink drills", file: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx", pattern: /EntityLink/ },
  { name: "equipment transfer EntityLink drills", file: "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx", pattern: /EntityLink/ },
  { name: "notify preferences EntityLink drills", file: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx", pattern: /EntityLink/ },
  { name: "dispatch settings page exists", file: "apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx", pattern: /export function DispatchSettingsPage|function DispatchSettingsPage/ },
  { name: "load template library exists", file: "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx", pattern: /export function LoadTemplateLibrary|function LoadTemplateLibrary/ },
  { name: "dispatch sheet resolves canonical stop location label", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /loc\.location_name[\s\S]{0,180}LEFT JOIN mdata\.locations loc[\s\S]{0,180}loc\.operating_company_id = \$2::uuid/ },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src == null) {
      failures.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(src)) failures.push(`${c.name}: shape missing in ${c.file}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (poison trips ${fail.length})`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — dispatch connectivity remainder routes + drills ratcheted`);
