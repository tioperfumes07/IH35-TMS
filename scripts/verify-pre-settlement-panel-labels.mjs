#!/usr/bin/env node
/**
 * Static guard: Pre-settlement panels must not expose raw UUIDs/ISO dates.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dispatchPanel = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx"), "utf8");
const driverPanel = fs.readFileSync(path.join(ROOT, "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx"), "utf8");
const errors = [];

for (const [name, content] of [
  ["dispatch/PreSettlementPanel", dispatchPanel],
  ["driver-finance/PreSettlementsPanel", driverPanel],
]) {
  if (/\.slice\(0,\s*8\)/.test(content)) {
    errors.push(`${name} renders raw UUID fragments`);
  }
  if (/\.toISOString\(\)|\.toLocaleDateString\(/.test(content)) {
    errors.push(`${name} uses unformatted ISO/locale dates`);
  }
  if (!/formatDateUS/.test(content)) {
    errors.push(`${name} does not use formatDateUS`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: Pre-settlement panels use human-readable labels and formatted dates");
process.exit(0);
