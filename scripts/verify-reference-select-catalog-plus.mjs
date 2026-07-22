#!/usr/bin/env node
/**
 * verify-reference-select-catalog-plus — QBO nested "+ Add new" keystone must stay the
 * software-wide pattern for catalog pickers (vendor/customer/item/category/part/service).
 *
 * This guard locks the shared component + documents that money/ops pickers must migrate
 * onto ReferenceSelect (or an explicit allowlisted creator) — not silent bare <select>s.
 * Full surface burn-down is tracked in docs/trackers/CATALOG-PLUS-CREATE-AUDIT-2026-07-22.md.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(rel) {
  const p = path.join(root, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

const ref = read("apps/frontend/src/components/parity/ReferenceSelect.tsx");
if (!ref) failures.push("missing ReferenceSelect.tsx — QBO + Add new keystone");
else {
  if (!/\+ Add new/.test(ref)) failures.push("ReferenceSelect must expose '+ Add new' label");
  if (!/QuickCreateEntityModal/.test(ref)) failures.push("ReferenceSelect must compose QuickCreateEntityModal");
  if (!/createKind/.test(ref)) failures.push("ReferenceSelect must require createKind");
}

const tracker = read("docs/trackers/CATALOG-PLUS-CREATE-AUDIT-2026-07-22.md");
if (!tracker) failures.push("missing docs/trackers/CATALOG-PLUS-CREATE-AUDIT-2026-07-22.md (TMS-wide + Create audit)");
else if (!/ReferenceSelect/.test(tracker)) failures.push("audit tracker must name ReferenceSelect as the shared keystone");

if (failures.length) {
  console.error("verify-reference-select-catalog-plus — FAILED");
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log("verify-reference-select-catalog-plus — OK");
