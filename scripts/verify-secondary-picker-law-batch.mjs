#!/usr/bin/env node
/**
 * Secondary picker_law — Built PartEditDrawer.
 * @matrix-built {"modules":["inventory"],"cols":["picker_law"],"leafRe":"^parts\\.edit$","task":"VERTICAL-PICKER-LAW-secondary-inventory","vertical":"column-wave"}
 * Self-test: node scripts/verify-secondary-picker-law-batch.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-secondary-picker-law-batch";
const FILE = "apps/frontend/src/pages/inventory/PartEditDrawer.tsx";
function fails(src){ return /EntityPicker|ReferenceSelect/.test(src) ? [] : ["no picker"]; }
if (process.argv.includes("--selftest")) {
  const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  if (fails(live).length) { console.error(`${LABEL} SELFTEST FAIL live`); process.exit(1); }
  if (!fails("// poison").length) { console.error(`${LABEL} SELFTEST FAIL poison`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS`); process.exit(0);
}
const f = fails(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
if (f.length) { console.error(`${LABEL} FAIL`); process.exit(1); }
console.log(`${LABEL} PASS`);
