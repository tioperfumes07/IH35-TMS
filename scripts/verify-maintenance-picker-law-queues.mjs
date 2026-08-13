#!/usr/bin/env node
/**
 * Maintenance picker_law — Built for PartsInventory + SevereRepair EntityPicker surfaces.
 *
 * @matrix-built {"modules":["maintenance"],"cols":["picker_law"],"leafRe":"^(parts_inventory\\.record_purchase|severe_repairs\\.convert_to_wo)$","task":"VERTICAL-PICKER-LAW-maintenance-queues","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-maintenance-picker-law-queues.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-picker-law-queues";
const CHECKS = [
  { name: "PartsInventoryTable", file: "apps/frontend/src/pages/maintenance/components/PartsInventoryTable.tsx" },
  { name: "SevereRepairOosTab", file: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx" },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) { fails.push(`${c.name}: missing`); continue; }
    if (!/EntityPicker|ReferenceSelect/.test(fs.readFileSync(abs, "utf8"))) fails.push(`${c.name}: no picker`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".maint-picker-selftest-"));
  try {
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) { console.error(`${LABEL} SELFTEST FAIL`); process.exit(1); }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) { console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`); process.exit(1); }
  process.exit(0);
}

const fails = run();
if (fails.length) { console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — maintenance picker_law queues ratcheted`);
