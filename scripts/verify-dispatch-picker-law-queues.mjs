#!/usr/bin/env node
/**
 * Dispatch picker_law — Built for EntityPicker/ReferenceSelect surfaces.
 *
 * @matrix-built {"modules":["dispatch"],"cols":["picker_law"],"leafRe":"^(secondary\\.assignments|queues\\.in_transit|docs\\.pod|settings\\.notify|dispatch\\.parity\\.book_load_equipment_section)$","task":"VERTICAL-PICKER-LAW-dispatch-queues","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-dispatch-picker-law-queues.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-picker-law-queues";

const CHECKS = [
  { name: "AssignmentHistoryPage", file: "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx", re: /EntityPicker/ },
  {
    name: "InTransitIssuesPage",
    file: "apps/frontend/src/pages/dispatch/InTransitIssuesPage.tsx",
    // LST-F5186 — list reverse filters must be EntityPicker + URL sync (not URL-only).
    require: [
      /dataTestId="intransit-issues-filter-driver"/,
      /dataTestId="intransit-issues-filter-load"/,
      /dataTestId="intransit-issues-filter-unit"/,
      /allowCreate=\{false\}/,
      /setSearchParams/,
      /searchParams\.get\("driver_id"\)/,
    ],
  },
  { name: "PodReviewPage", file: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx", re: /EntityPicker/ },
  { name: "NotifyPreferencesPage", file: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx", re: /ReferenceSelect/ },
  { name: "BookLoadEquipmentSection", file: "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx", re: /EntityPicker/ },
];

function run(root = ROOT) {
  const fails = [];
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (c.require) {
      for (const re of c.require) {
        if (!re.test(src)) fails.push(`${c.name}: missing ${re}`);
      }
    } else if (!c.re.test(src)) {
      fails.push(`${c.name}: no picker`);
    }
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".dispatch-picker-selftest-"));
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
console.log(`${LABEL} PASS — dispatch picker_law queues ratcheted`);
