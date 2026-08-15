#!/usr/bin/env node
/**
 * Safety picker_law — Built for list surfaces with EntityPicker.
 *
 * @matrix-built {"modules":["safety"],"cols":["picker_law","reverse_link","connectivity"],"leafRe":"^(hos_violations\\.list|idvr\\.list|dot_inspections\\.list|safety_events\\.list|internal_fines\\.list|permits\\.list|driver_scheduler\\.list|drug_alcohol\\.list)$","task":"VERTICAL-PICKER-LAW-safety-lists","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-safety-picker-law-lists.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-picker-law-lists";

const CHECKS = [
  { name: "HOSViolationsTab", file: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx" },
  { name: "IdvrPage", file: "apps/frontend/src/pages/safety/IdvrPage.tsx" },
  { name: "DOTInspectionsTab", file: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx" },
  { name: "SafetyEventsPage", file: "apps/frontend/src/pages/safety/SafetyEventsPage.tsx" },
  { name: "InternalFinesPage", file: "apps/frontend/src/pages/safety/InternalFinesPage.tsx" },
  { name: "PermitsPage", file: "apps/frontend/src/pages/safety/PermitsPage.tsx" },
  { name: "DriverSchedulerGridPage", file: "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx" },
  {
    name: "DrugAlcoholTab",
    file: "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx",
    // LST-F5183 — reverse filter must be EntityPicker + URL sync (not DriverPickerWithCreate without URL write).
    require: [
      /EntityPicker/,
      /kind="driver"/,
      /allowCreate=\{false\}/,
      /dataTestId="drug-alcohol-filter-driver"/,
      /searchParams\.get\("driver_id"\)/,
      /setSearchParams/,
    ],
  },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) { fails.push(`${c.name}: missing`); continue; }
    const src = fs.readFileSync(abs, "utf8");
    if (c.require) {
      for (const re of c.require) {
        if (!re.test(src)) fails.push(`${c.name}: missing ${re}`);
      }
      if (/<DriverPickerWithCreate[\s>]/.test(src)) fails.push(`${c.name}: must not use DriverPickerWithCreate on reverse filter`);
    } else if (!/EntityPicker|ReferenceSelect/.test(src)) {
      fails.push(`${c.name}: no picker`);
    }
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".safety-picker-selftest-"));
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
console.log(`${LABEL} PASS — safety picker_law lists ratcheted`);
