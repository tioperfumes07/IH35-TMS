#!/usr/bin/env node
// BLOCK LIST-EMPTY-1 — static guard.
//
// Locks the fix for the false-empty defect: paged lists (Vendors, Customers)
// must render their empty state ("No X found") ONLY through the shared
// list-state primitive (src/components/list-state), which returns "empty" only
// on a settled, zero-row query — never mid-fetch. This guard fails if a migrated
// list surface stops routing its empty state through the primitive (regression),
// and reports a sweep count of not-yet-migrated offenders for TBL-STANDARD
// follow-on tracking.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const TAG = "[verify-list-empty-settled]";
const PRIMITIVE_DIR = "apps/frontend/src/components/list-state";

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), "utf8");
}

function fail(msg) {
  console.error(`${TAG} FAIL: ${msg}`);
  process.exit(1);
}

// 1) The shared primitive itself must exist and hold the settled-only invariant.
const primitiveFiles = ["listState.ts", "useListState.ts", "ListStateBoundary.tsx", "index.ts"];
for (const f of primitiveFiles) {
  const rel = path.join(PRIMITIVE_DIR, f);
  if (!fs.existsSync(path.join(repoRoot, rel))) fail(`missing shared primitive file ${rel}`);
}
const listStateSrc = read(path.join(PRIMITIVE_DIR, "listState.ts"));
if (!/if\s*\(\s*status\.isPending\s*\)\s*return\s*"loading"/.test(listStateSrc)) {
  fail("resolveListState no longer returns loading while pending — the settled-only invariant is gone");
}
if (!/isEmpty\s*&&\s*status\.isFetching\)\s*return\s*"loading"/.test(listStateSrc)) {
  fail("resolveListState no longer treats zero-rows-while-fetching as loading (race guard removed)");
}

// 2) Migrated list surfaces: each MUST import the primitive and gate every
//    empty literal on the resolved settled state (listState.isEmpty / === "empty").
const MIGRATED = [
  { file: "apps/frontend/src/pages/vendors/VendorsListView.tsx", empties: ["No vendors found."] },
  { file: "apps/frontend/src/pages/vendors/VendorListSidebar.tsx", empties: ["No vendors found."] },
  { file: "apps/frontend/src/pages/customers/CustomersListView.tsx", empties: ["No customers match this filter."] },
  { file: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx", empties: ["No customers found."] },
  // TBL-STANDARD batch 1 (2026-07-04) — inline-query catalog pages.
  { file: "apps/frontend/src/pages/EquipmentTypesPage.tsx", empties: ["No equipment types found."] },
  { file: "apps/frontend/src/pages/DriverLoadStatusesPage.tsx", empties: ["No statuses found."] },
];

for (const { file, empties } of MIGRATED) {
  if (!fs.existsSync(path.join(repoRoot, file))) fail(`migrated list surface missing: ${file}`);
  const src = read(file);
  if (!src.includes("components/list-state")) {
    fail(`${file} no longer imports the shared list-state primitive`);
  }
  if (!/useListState|resolveListState/.test(src)) {
    fail(`${file} no longer references the list-state hook/resolver`);
  }
  for (const literal of empties) {
    let idx = src.indexOf(literal);
    if (idx === -1) fail(`${file} expected empty literal not found: "${literal}"`);
    while (idx !== -1) {
      // The empty literal must sit inside a settled-state branch: an isEmpty /
      // === "empty" guard within the preceding window. Anything gated on a bare
      // `.length === 0` alone (the defect) is rejected.
      const window = src.slice(Math.max(0, idx - 400), idx);
      const gated = /listState\.isEmpty|state === "empty"|\.isEmpty\b/.test(window);
      const bareLength = /\.length === 0 \?/.test(window) && !gated;
      if (!gated || bareLength) {
        fail(`${file}: empty literal "${literal}" is not gated on the settled list-state (found a raw data-length empty render)`);
      }
      idx = src.indexOf(literal, idx + literal.length);
    }
  }
}

// 3) SWEEP (informational, non-failing): remaining paged-list empty literals not
//    yet routed through the primitive. Reported for TBL-STANDARD follow-on blocks.
const pagesRoot = path.join(repoRoot, "apps/frontend/src/pages");
const EMPTY_RE = /No\s+[A-Za-z][A-Za-z ]*?\s+(found|match(?:es|ing)?)\b/;
const migratedSet = new Set(MIGRATED.map((m) => m.file));
const offenders = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      const rel = path.relative(repoRoot, full);
      if (migratedSet.has(rel)) continue;
      const src = fs.readFileSync(full, "utf8");
      if (!EMPTY_RE.test(src)) continue;
      // Only flag files that gate an empty literal on a bare data length without
      // any list-state primitive — those are candidate false-empty surfaces.
      const usesPrimitive = src.includes("components/list-state");
      const bareLengthEmpty = /\.length === 0\s*\?/.test(src);
      if (!usesPrimitive && bareLengthEmpty) offenders.push(rel);
    }
  }
}
if (fs.existsSync(pagesRoot)) walk(pagesRoot);

console.log(`${TAG} migrated + locked: ${MIGRATED.length} list surfaces route empty through the shared primitive.`);
console.log(`${TAG} sweep: ${offenders.length} not-yet-migrated paged-list empty surface(s) (candidate false-empty, track in TBL-STANDARD):`);
for (const o of offenders.sort()) console.log(`${TAG}   - ${o}`);
console.log(`${TAG} OK`);
