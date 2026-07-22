#!/usr/bin/env node
/**
 * CHROME-11 — nested +Create from a money surface must open InlineCreateDrawer / ParityDrawer
 * chrome, never a centered Modal stacked on top of an already-open money drawer.
 *
 * Covers the two nested-create backends behind ReferenceSelect (A2) plus the driver-picker
 * carve-out (VendorBillForm's "+ Create driver" inside the Bill ParityDrawer), which does not go
 * through ReferenceSelect because CreateDriverModal is the single canonical driver creator
 * (Blueprint 4.2.2.1) and must not be duplicated.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const failures = [];

function read(relPath) {
  return readFileSync(resolve(ROOT, relPath), "utf8");
}

// 1) ReferenceSelect (A2) must keep routing every createKind through InlineCreateDrawer or
//    QuickCreateEntityModal — both ParityDrawer-shell chrome — never a bare centered Modal.
const referenceSelect = read("apps/frontend/src/components/parity/ReferenceSelect.tsx");
if (!referenceSelect.includes("InlineCreateDrawer")) {
  failures.push("ReferenceSelect.tsx no longer wires InlineCreateDrawer");
}
if (!referenceSelect.includes("QuickCreateEntityModal")) {
  failures.push("ReferenceSelect.tsx no longer wires QuickCreateEntityModal");
}
if (/from\s+["']\.\.\/Modal["']/.test(referenceSelect)) {
  failures.push("ReferenceSelect.tsx imports the centered Modal shell directly — regression to Modal-on-drawer");
}

// 2) QuickCreateEntityModal's own outer shell must stay ParityDrawer (fixed by PR #3200) — never
//    regress back to the centered Modal it replaced.
const quickCreate = read("apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx");
if (!quickCreate.includes("ParityDrawer")) {
  failures.push("QuickCreateEntityModal.tsx no longer shells with ParityDrawer");
}
if (/<Modal[\s>]/.test(quickCreate)) {
  failures.push("QuickCreateEntityModal.tsx renders a centered <Modal> — Modal-on-drawer regression");
}

// 3) CreateDriverModal must support the shell="drawer" nested variant (ParityDrawer chrome) while
//    keeping shell="modal" as the unchanged default for top-level entry points.
const createDriverModal = read("apps/frontend/src/components/drivers/CreateDriverModal.tsx");
if (!/shell\??:\s*"modal"\s*\|\s*"drawer"/.test(createDriverModal)) {
  failures.push('CreateDriverModal.tsx missing shell?: "modal" | "drawer" prop');
}
if (!createDriverModal.includes('shell === "drawer"')) {
  failures.push("CreateDriverModal.tsx no longer branches on shell === \"drawer\"");
}
if (!createDriverModal.includes("ParityDrawer")) {
  failures.push("CreateDriverModal.tsx no longer imports/uses ParityDrawer for the drawer shell");
}

// 4) VendorBillForm (Bill create ParityDrawer — the highest-traffic money path this block targets)
//    must open the nested driver creator with shell="drawer", not the bare centered Modal.
const vendorBillForm = read("apps/frontend/src/components/accounting/VendorBillForm.tsx");
if (!/<CreateDriverModal[\s\S]{0,700}?shell="drawer"/.test(vendorBillForm)) {
  failures.push('VendorBillForm.tsx <CreateDriverModal> no longer passes shell="drawer" — Modal-on-drawer regression on Bill create');
}

if (failures.length) {
  console.error("FAIL verify-chrome-11-nested-create-drawer:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("PASS verify-chrome-11-nested-create-drawer — nested +Create stays InlineCreateDrawer/ParityDrawer chrome");
