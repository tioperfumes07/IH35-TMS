#!/usr/bin/env node
/**
 * LV-WO-PARTPANEL-BEHIND-MODAL-DESTROYS-FORM — nested quick-create side panels from
 * centered wizards (Create Work Order, Book Load) must render ABOVE the parent modal
 * overlay and stop outside-click from reaching it.
 *
 * Contract enforced:
 *  - shared Modal overlay sits BELOW the nested-drawer tier (originally z-[215]; now z-[1001] per 95d776be44)
 *  - ParityDrawer stackAboveModal sits above Modal, below Combobox's listbox (was z-[218] < 220; now z-[1003] < 1100 —
 *    verify-parity-drawer-z-index-above-modal.mjs is the primary lock for this relationship;
 *    this guard keeps its own independent, literal-pinned check as a second line of defense)
 *  - QuickCreateEntityModal and CatalogQuickCreateDrawer pass stackAboveModal
 *  - CreateWorkOrderModal uses the shared Modal shell
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-create-modal-stack-order";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assert(cond, msg, errors) {
  if (!cond) errors.push(msg);
}

// 443.187 repoint — the tiers moved together in 95d776be44 (CI-MODAL-Z-20261007, #25675: Modal z-[1001] above the
// DatePicker/SaveDropdown popovers at 1000; ParityDrawer stackAboveModal z-[1003]; Combobox LISTBOX_Z_INDEX 1100). The rule is
// unchanged and now checked as the ORDER, read from source, instead of frozen numbers:
//   shared Modal overlay  <  ParityDrawer stackAboveModal  <  Combobox listbox
// and no create modal introduces its own overlay at or above the nested-drawer tier.
const zOf = (re, src) => [...src.matchAll(re)].map((m) => Number(m[1]));

export function run(
  modal = read("apps/frontend/src/components/Modal.tsx"),
  parityDrawer = read("apps/frontend/src/components/parity/ParityDrawer.tsx"),
  combobox = read("apps/frontend/src/components/Combobox.tsx"),
) {
  const errors = [];
  const modalZ = zOf(/fixed inset-0 z-\[(\d+)\]/g, modal);
  const drawerZ = zOf(/stackAboveModal\s*\?\s*"z-\[(\d+)\]"/g, parityDrawer)[0];
  const listboxZ = zOf(/LISTBOX_Z_INDEX\s*=\s*(\d+)/g, combobox)[0];
  assert(modalZ.length > 0 && new Set(modalZ).size === 1, "Modal overlay z-index not found (or the overlay variants disagree)", errors);
  assert(Number.isFinite(drawerZ), "ParityDrawer must expose stackAboveModal → z-[N] (the nested create tier)", errors);
  assert(Number.isFinite(listboxZ), "Combobox LISTBOX_Z_INDEX not found", errors);
  const m = modalZ[0];
  if (Number.isFinite(m) && Number.isFinite(drawerZ)) {
    assert(drawerZ > m, `ParityDrawer stackAboveModal z-[${drawerZ}] must sit ABOVE the Modal overlay z-[${m}]`, errors);
  }
  if (Number.isFinite(drawerZ) && Number.isFinite(listboxZ)) {
    assert(drawerZ < listboxZ, `ParityDrawer stackAboveModal z-[${drawerZ}] must stay BELOW the Combobox listbox ${listboxZ} so a picker inside it paints on top`, errors);
  }
  assert(
    parityDrawer.includes('data-parity-drawer-stack-above-modal'),
    "ParityDrawer stackAboveModal must set data attribute so parent Modal Escape ignores it",
    errors
  );

  const quickCreate = read("apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx");
  assert(/<ParityDrawer[^>]*stackAboveModal/.test(quickCreate), "QuickCreateEntityModal must pass stackAboveModal to ParityDrawer", errors);
  const catalogQuickCreate = read("apps/frontend/src/components/parity/CatalogQuickCreateDrawer.tsx");
  assert(/<ParityDrawer[^>]*stackAboveModal/.test(catalogQuickCreate), "CatalogQuickCreateDrawer must pass stackAboveModal to ParityDrawer", errors);

  const woModal = read("apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx");
  assert(/<Modal\b/.test(woModal), "CreateWorkOrderModal must use the shared Modal shell (not a custom overlay)", errors);
  const woZ = zOf(/z-\[(\d+)\]/g, woModal);
  if (Number.isFinite(drawerZ)) {
    assert(!woZ.some((z) => z >= drawerZ), `CreateWorkOrderModal must not introduce its own overlay at or above the nested-drawer tier z-[${drawerZ}]`, errors);
  }
  return errors;
}

function selftest() {
  const modal = read("apps/frontend/src/components/Modal.tsx");
  const drawer = read("apps/frontend/src/components/parity/ParityDrawer.tsx");
  const combobox = read("apps/frontend/src/components/Combobox.tsx");
  if (run(modal, drawer, combobox).length) {
    console.error(`${LABEL}: SELFTEST FAIL — baseline not clean: ${run(modal, drawer, combobox).join(" | ")}`);
    process.exit(1);
  }
  const plants = [
    ["modal jumps above the nested drawer", run(modal.replace(/fixed inset-0 z-\[(\d+)\]/g, "fixed inset-0 z-[5000]"), drawer, combobox)],
    ["drawer drops below the modal", run(modal, drawer.replace(/stackAboveModal \? "z-\[\d+\]"/, 'stackAboveModal ? "z-[50]"'), combobox)],
    ["drawer climbs above the listbox", run(modal, drawer.replace(/stackAboveModal \? "z-\[\d+\]"/, 'stackAboveModal ? "z-[9000]"'), combobox)],
    ["drawer loses its Escape marker", run(modal, drawer.replaceAll("data-parity-drawer-stack-above-modal", "data-x"), combobox)],
  ];
  const missed = plants.filter(([, e]) => e.length === 0).map(([n]) => n);
  if (missed.length) {
    console.error(`${LABEL}: SELFTEST FAIL — not caught: ${missed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST PASS (${plants.length} planted inversions detected)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = run();
  if (errors.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — nested quick-create panels stack above parent modal`);
}

main();
