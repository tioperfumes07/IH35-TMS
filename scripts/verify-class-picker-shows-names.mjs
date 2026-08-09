#!/usr/bin/env node
/**
 * Static guard: class pickers must display class names/codes, not raw UUIDs.
 * Checks forms and detail pages that surface class_id for raw UUID rendering.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "apps/frontend/src/components/accounting/VendorBillForm.tsx",
  "apps/frontend/src/components/parity/drawers/NewServiceDrawerForm.tsx",
  "apps/frontend/src/components/accounting/ManualJEModal.tsx",
  "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx",
  "apps/frontend/src/pages/banking/components/ManualJEModal.tsx",
  "apps/frontend/src/pages/DriverDetail.tsx",
  "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
];

const errors = [];
for (const file of files) {
  const content = fs.readFileSync(path.join(ROOT, file), "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Raw UUID fragment rendering: classId.class_id.class_uuid.slice(0,8)
    if (/class(?:_)?(?:id|uuid)\.slice\(0,\s*8\)/i.test(line)) {
      errors.push(`${file}:${i + 1} renders raw class UUID fragment`);
    }
    // Direct JSX text rendering: {classId} / {class_id} / {class_uuid}.
    // Skip prop bindings like value={classId} by checking for '=' before the brace on the same line.
    const directRender = [...line.matchAll(/\{class(?:_)?(?:id|uuid)\s*\}/gi)];
    for (const m of directRender) {
      const before = line.slice(0, m.index);
      if (!/=\s*$/.test(before)) {
        errors.push(`${file}:${i + 1} renders raw class UUID directly: ${m[0]}`);
      }
    }
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error("FAIL:", e);
  process.exit(1);
}
console.log("PASS: class pickers and class_id surfaces show names/codes, not raw UUIDs");
process.exit(0);
