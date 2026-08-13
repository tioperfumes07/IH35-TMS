#!/usr/bin/env node
/**
 * Fleet picker_law — Built for EditVehicleModal EntityPicker.
 *
 * @matrix-built {"modules":["fleet"],"cols":["picker_law"],"leafRe":"^(roster\\.row\\.edit_unit|unit\\.edit\\.identity|unit\\.edit\\.quick_availability)$","task":"VERTICAL-PICKER-LAW-fleet-edit","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-fleet-picker-law-edit.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-picker-law-edit";
const FILE = "apps/frontend/src/components/fleet/EditVehicleModal.tsx";

function fails(src) {
  const out = [];
  if (!/EntityPicker/.test(src)) out.push("no EntityPicker");
  return out;
}

if (process.argv.includes("--selftest")) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  if (fails(live).length) { console.error(`${LABEL} SELFTEST FAIL live`); process.exit(1); }
  if (!fails("// poison").length) { console.error(`${LABEL} SELFTEST FAIL poison`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const f = fails(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (f.length) { console.error(`${LABEL} FAIL:\n- ${f.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — fleet EditVehicleModal picker_law ratcheted`);
