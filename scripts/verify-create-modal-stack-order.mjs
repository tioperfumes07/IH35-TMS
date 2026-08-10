#!/usr/bin/env node
/**
 * LV-WO-PARTPANEL-BEHIND-MODAL-DESTROYS-FORM — nested quick-create side panels from
 * centered wizards (Create Work Order, Book Load) must render ABOVE the parent modal
 * overlay and stop outside-click from reaching it.
 *
 * Contract enforced:
 *  - shared Modal overlay is z-[70]
 *  - ParityDrawer stackAboveModal mode is z-[80]
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

export function run() {
  const errors = [];

  const modal = read("apps/frontend/src/components/Modal.tsx");
  assert(
    modal.includes("z-[70]"),
    "Modal overlay must remain at z-[70] so nested ParityDrawer z-[80] can stack above it",
    errors
  );
  assert(
    !/z-\[8[0-9]\]/.test(modal) && !/z-\[90\]/.test(modal),
    "Modal overlay must not jump to z-[80+] and cover its nested drawers",
    errors
  );

  const parityDrawer = read("apps/frontend/src/components/parity/ParityDrawer.tsx");
  assert(
    /stackAboveModal\s*\?\s*"z-\[80\]"/.test(parityDrawer),
    "ParityDrawer must expose stackAboveModal → z-[80] to sit above Modal z-[70]",
    errors
  );
  assert(
    parityDrawer.includes('data-parity-drawer-stack-above-modal'),
    "ParityDrawer stackAboveModal must set data attribute so parent Modal Escape ignores it",
    errors
  );

  const quickCreate = read("apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx");
  assert(
    /<ParityDrawer[^>]*stackAboveModal/.test(quickCreate),
    "QuickCreateEntityModal must pass stackAboveModal to ParityDrawer",
    errors
  );

  const catalogQuickCreate = read("apps/frontend/src/components/parity/CatalogQuickCreateDrawer.tsx");
  assert(
    /<ParityDrawer[^>]*stackAboveModal/.test(catalogQuickCreate),
    "CatalogQuickCreateDrawer must pass stackAboveModal to ParityDrawer",
    errors
  );

  const woModal = read("apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx");
  assert(
    /<Modal\b/.test(woModal),
    "CreateWorkOrderModal must use the shared Modal shell (not a custom overlay)",
    errors
  );
  assert(
    !/z-\[8[0-9]\]/.test(woModal),
    "CreateWorkOrderModal must not introduce its own z-[80+] overlay",
    errors
  );

  return errors;
}

function selftest() {
  const p = path.join(ROOT, "apps/frontend/src/components/Modal.tsx");
  const backup = read("apps/frontend/src/components/Modal.tsx");
  try {
    // Plant a higher z-index — should be caught
    const planted = backup.replace(/z-\[70\]/g, "z-[90]");
    fs.writeFileSync(p, planted, "utf8");
    const plantedErrors = run();
    if (!plantedErrors.some((e) => e.includes("z-[80+]"))) {
      console.error(`${LABEL}: SELFTEST FAIL — planted z-[90] was not detected`);
      process.exit(1);
    }
    console.log(`${LABEL}: SELFTEST PASS (${plantedErrors.length} planted failures detected)`);
  } finally {
    fs.writeFileSync(p, backup, "utf8");
  }
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
