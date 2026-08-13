#!/usr/bin/env node
/**
 * Dispatch reverse_link — Built for queue/doc leaves with EntityLink.
 * Modal/panel/wizard/parity + map chrome honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leafRe":"^(queues\\.(border|alerts|trip_pairing|factoring|factoring_queue)|docs\\.(ocr|equipment_transfers)|misc\\.layover)$","task":"VERTICAL-REVERSE-LINK-dispatch-queues","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-dispatch-reverse-link-queues.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-reverse-link-queues";

const CHECKS = [
  { name: "BorderCrossingHistoryPage EntityLink", file: "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx", pattern: /EntityLink/ },
  { name: "AtRiskQueuePage EntityLink", file: "apps/frontend/src/pages/dispatch/AtRiskQueuePage.tsx", pattern: /EntityLink/ },
  { name: "TripPairingBoardPage EntityLink", file: "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", pattern: /EntityLink/ },
  { name: "FactoringQueuePage EntityLink", file: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx", pattern: /EntityLink/ },
  { name: "FactoringListPage EntityLink (queues.factoring)", file: "apps/frontend/src/pages/accounting/FactoringListPage.tsx", pattern: /EntityLink/ },
  { name: "OcrQueuePage EntityLink", file: "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx", pattern: /EntityLink/ },
  { name: "EquipmentTransferRequests EntityLink", file: "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx", pattern: /EntityLink/ },
  { name: "DriverLayoverHistory EntityLink", file: "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx", pattern: /EntityLink/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing`);
      continue;
    }
    if (!c.pattern.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no EntityLink`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".dispatch-reverse-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — dispatch reverse_link queues ratcheted`);
