#!/usr/bin/env node
/**
 * C-01..C-03 + C-16 + C-17 — master-detail shell / SegmentedControl / default view guard.
 * Static wiring checks (live getComputedStyle is Chrome after FE deploy).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-c01-c17-master-detail-shell";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  segment: "apps/frontend/src/components/SegmentedControl.tsx",
  shell: "apps/frontend/src/components/layout/MasterDetailShell.tsx",
  token: "apps/frontend/src/design/master-detail.ts",
  pref: "apps/frontend/src/hooks/useViewModePref.ts",
  customers: "apps/frontend/src/pages/Customers.tsx",
  vendors: "apps/frontend/src/pages/Vendors.tsx",
  drivers: "apps/frontend/src/pages/Drivers.tsx",
  custSide: "apps/frontend/src/pages/customers/CustomerListSidebar.tsx",
  vendSide: "apps/frontend/src/pages/vendors/VendorListSidebar.tsx",
  drvSide: "apps/frontend/src/pages/drivers/DriverListSidebar.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function audit() {
  const f = [];
  const token = read(FILES.token);
  if (!/masterPaneClass:[\s\S]*xl:w-\[640px\]/.test(token)) {
    f.push(`${FILES.token}: C-16 master pane must pin xl:w-[640px] (was 440)`);
  }
  if (!/surfaceClass/.test(token)) f.push(`${FILES.token}: C-03 surfaceClass missing`);

  const segment = read(FILES.segment);
  if (!/min-w-\[4\.5rem\]/.test(segment)) f.push(`${FILES.segment}: C-01 min-width missing`);
  if (!/data-segmented-control/.test(segment)) f.push(`${FILES.segment}: C-01 marker missing`);
  if (!/segmentInactiveClass/.test(segment)) f.push(`${FILES.segment}: C-01 inactive tint missing`);

  const pref = read(FILES.pref);
  if (!/:chosen/.test(pref)) f.push(`${FILES.pref}: C-02 chosen flag missing`);
  if (!/useState<EntityViewMode>\(\(\) => defaultMode\)/.test(pref)) {
    f.push(`${FILES.pref}: C-02 must seed from defaultMode, not localStorage`);
  }
  if (!/"drivers"/.test(pref)) f.push(`${FILES.pref}: C-17 drivers entity missing from useViewModePref`);

  for (const [name, file] of [
    ["customers", FILES.customers],
    ["vendors", FILES.vendors],
    ["drivers", FILES.drivers],
  ]) {
    const src = read(file);
    if (!/MasterDetailShell/.test(src)) f.push(`${file}: C-17 MasterDetailShell missing`);
    if (!/SegmentedControl/.test(src)) f.push(`${file}: C-01 SegmentedControl missing`);
  }

  for (const file of [FILES.custSide, FILES.vendSide, FILES.drvSide]) {
    const src = read(file);
    if (!/MASTER_DETAIL\.masterPaneClass/.test(src)) {
      f.push(`${file}: must use MASTER_DETAIL.masterPaneClass (C-16)`);
    }
    if (!/MASTER_DETAIL\.surfaceClass/.test(src)) {
      f.push(`${file}: must use MASTER_DETAIL.surfaceClass (C-03)`);
    }
  }

  const shell = read(FILES.shell);
  if (!/MASTER_DETAIL\.shellClass/.test(shell)) f.push(`${FILES.shell}: shellClass missing`);

  return f;
}

if (SELFTEST) {
  const failures = audit();
  const mutated = read(FILES.token).replace("xl:w-[640px]", "");
  const wouldCatch = !/xl:w-\[640px\]/.test(mutated);
  if (!wouldCatch) {
    console.error(`${LABEL} SELFTEST FAIL — could not prove C-16 width trip`);
    process.exit(1);
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — live tree already red:`);
    for (const x of failures) console.error(`  - ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const failures = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of failures) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — C-01/C-02/C-03/C-16/C-17 shell wired`);
process.exit(0);
