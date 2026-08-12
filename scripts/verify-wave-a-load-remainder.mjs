#!/usr/bin/env node
/**
 * WAVE-A load remainder — surfaces that already drill/submit load FKs but lacked @matrix-built.
 *
 * @matrix-built {"modules":["dispatch"],"cols":["load"],"leafRe":"^(queues\\.(trip_pairing|factoring_queue|border|alerts|map)$|docs\\.(pod|ocr)$|settings\\.notify$|misc\\.layover$)","task":"WAVE-A-load-remainder-dispatch","vertical":"column-wave"}
 * @matrix-built {"modules":["safety"],"cols":["load"],"leafRe":"^(safety_events\\.list$|damage_reports\\.|internal_fines\\.create$)","task":"WAVE-A-load-remainder-safety","vertical":"column-wave"}
 * @matrix-built {"modules":["factoring"],"cols":["load"],"leafRe":"^(submit\\.queue|batches\\.(create|detail)|accounting\\.(list|submit|detail)|banking\\.entry)$","task":"WAVE-A-load-remainder-factoring","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-a-load-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-a-load-remainder";

const CHECKS = [
  { name: "trip pairing load drill", file: "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", pattern: /kind="load"/ },
  { name: "factoring queue load drill", file: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx", pattern: /kind="load"/ },
  { name: "POD review load drill", file: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx", pattern: /kind="load"/ },
  { name: "border history load drill", file: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx", pattern: /kind="load"/ },
  { name: "at-risk / alerts load drill", file: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx", pattern: /kind="load"/ },
  { name: "map view load_id focus", file: "apps/frontend/src/pages/dispatch/MapView.tsx", pattern: /load_id/ },
  { name: "notify prefs load EntityLink", file: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx", pattern: /kind="load"/ },
  { name: "OCR convert to Book Load", file: "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx", pattern: /Convert to load/ },
  { name: "layover history load EntityLink", file: "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx", pattern: /kind="load"/ },
  { name: "safety events load drill", file: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx", pattern: /kind="load"/ },
  { name: "incidents cluster load drill", file: "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx", pattern: /kind="load"/ },
  { name: "internal fine create related_load_id", file: "apps/frontend/src/pages/safety/components/FineCreateModal.tsx", pattern: /related_load_id/ },
  { name: "factoring submission queue", file: "apps/frontend/src/pages/factoring/SubmissionQueue.tsx", pattern: /EntityLink/ },
  { name: "factoring batch detail", file: "apps/frontend/src/pages/factoring/BatchDetail.tsx", pattern: /EntityLink/ },
  { name: "factoring home load drill", file: "apps/frontend/src/pages/factoring/FactoringHome.tsx", pattern: /kind="load"/ },
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
console.log(`${LABEL} PASS — load remainder dispatch/safety/factoring ratcheted`);
