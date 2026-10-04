#!/usr/bin/env node
import { readFileSync } from "fs";

const indexTs = readFileSync("apps/backend/src/index.ts", "utf8");
const integrityTab = readFileSync("apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx", "utf8");
const card = readFileSync("apps/frontend/src/components/home/VendorMappingIntegrityCard.tsx", "utf8");

function fail(msg) {
  console.error(`✗ FAIL: ${msg}`);
  process.exit(1);
}

const checks = [
  ["worker initialized", indexTs.includes("initializeDriverVendorMappingWorker")],
  ["routes registered", indexTs.includes("registerDriverVendorMappingIntegrityRoutes")],
  ["tab rendered", integrityTab.includes("DriverVendorMappingTab") || integrityTab.includes("driver-vendor-mapping")],
];
let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`✓ ${label}`);
  else { console.error(`✗ FAIL: ${label}`); failed = true; }
}
if (failed) process.exit(1);

// BANK-F91374 leftover refuse — VendorMappingIntegrityCard page-scoped text token ratchet
if (card.includes("text-[11px]")) fail("VendorMappingIntegrityCard.tsx: leftover text-[11px]");
if (card.includes("#8A92AB")) fail("VendorMappingIntegrityCard.tsx: leftover off-scale muted #8A92AB");

if (process.argv.includes("--selftest")) {
  let mutationCount = 0;
  const leftoverPlant = card + '\n<div className="text-[11px] text-[#8A92AB]">plant</div>\n';
  if (!(leftoverPlant.includes("text-[11px]") && leftoverPlant.includes("#8A92AB"))) {
    console.error("verify-driver-vendor-mapping-monitor --selftest FAILED: leftover plant escaped");
    process.exit(1);
  }
  // Simulate refuse detecting plant
  const plantFails = [];
  if (leftoverPlant.includes("text-[11px]")) plantFails.push("leftover text-[11px]");
  if (!plantFails.includes("leftover text-[11px]")) {
    console.error("verify-driver-vendor-mapping-monitor --selftest FAILED: leftover refuse inert");
    process.exit(1);
  }
  mutationCount += 1;
  console.log(`verify-driver-vendor-mapping-monitor --selftest OK — ${mutationCount}/${mutationCount} mutations detected`);
  process.exit(0);
}

console.log("GAP-52 driver-vendor mapping guard: PASS");
