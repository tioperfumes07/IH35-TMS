#!/usr/bin/env node
/**
 * WO-CREATE-UX — Create Work Order nested QuickCreate must stack above Modal z-[215] and Escape
 * must not discard the parent wizard when a Combobox list or nested ParityDrawer is open.
 * z-tier updated 2026-08-21 (CC-3) alongside CANCEL-LOAD-MODAL-INVISIBLE-BEHIND-DRAWER's Modal
 * z-[70]->z-[215] bump — see verify-parity-drawer-z-index-above-modal.mjs for the primary lock.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const FILES = {
  parityDrawer: join(ROOT, "apps/frontend/src/components/parity/ParityDrawer.tsx"),
  quickCreate: join(ROOT, "apps/frontend/src/components/forms/shared/QuickCreateEntityModal.tsx"),
  catalogQuickCreate: join(ROOT, "apps/frontend/src/components/parity/CatalogQuickCreateDrawer.tsx"),
  inlineCreate: join(ROOT, "apps/frontend/src/components/parity/InlineCreateDrawer.tsx"),
  combobox: join(ROOT, "apps/frontend/src/components/Combobox.tsx"),
  modal: join(ROOT, "apps/frontend/src/components/Modal.tsx"),
  woNewPage: join(ROOT, "apps/frontend/src/pages/maintenance/WorkOrderNewPage.tsx"),
  manifest: join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  vehicleActionBar: join(ROOT, "apps/frontend/src/components/vehicle-profile/ActionBar.tsx"),
};

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const LABEL = "verify-wo-create-ux-escape-zindex";

export function run(reader = readFileSync) {
  const read = (file) => strip(reader(file, "utf8"));
  const parityDrawer = read(FILES.parityDrawer);
  const quickCreate = read(FILES.quickCreate);
  const catalogQuickCreate = read(FILES.catalogQuickCreate);
  const inlineCreate = read(FILES.inlineCreate);
  const combobox = read(FILES.combobox);
  const modal = read(FILES.modal);
  const woNewPage = read(FILES.woNewPage);
  const manifest = read(FILES.manifest);
  const vehicleActionBar = read(FILES.vehicleActionBar);

  const checks = [
    ["parity-stack-prop", /stackAboveModal\?:\s*boolean/.test(parityDrawer)],
    ["parity-z218", /stackAboveModal\s*\?\s*"z-\[218\]"/.test(parityDrawer)],
    ["parity-escape-capture", /stackAboveModal\s*\?\s*\{\s*capture:\s*true\s*\}/.test(parityDrawer)],
    ["parity-stack-marker", /data-parity-drawer-stack-above-modal/.test(parityDrawer)],
    ["quick-create-stack", /stackAboveModal/.test(quickCreate)],
    ["catalog-quick-create-stack", /stackAboveModal/.test(catalogQuickCreate)],
    ["inline-create-stack", /stackAboveModal/.test(inlineCreate)],
    ["combobox-escape-stop", /event\.key === "Escape"[\s\S]{0,120}stopPropagation\(\)/.test(combobox)],
    ["modal-escape-guard-combobox", /data-combobox-listbox="portal"/.test(modal)],
    ["modal-escape-guard-drawer", /data-parity-drawer-stack-above-modal="true"/.test(modal)],
    ["modal-escape-guard-datepicker", /data-date-picker-popover="open"/.test(modal)],
    ["wo-new-page", /export function WorkOrderNewPage/.test(woNewPage)],
    ["manifest-wo-new-route", /path="\/maintenance\/work-orders\/new"/.test(manifest) && /WorkOrderNewPage/.test(manifest)],
    ["vehicle-actionbar-spa-link", /<Link[\s\S]{0,200}work-orders\/new/.test(vehicleActionBar)],
  ];

  const failed = checks.filter(([, ok]) => !ok).map(([id]) => id);
  return {
    ok: failed.length === 0,
    failed,
    message:
      failed.length === 0
        ? `PASS: WO create nested Save z-index + Escape scope (${checks.length}/${checks.length}).`
        : `FAIL: ${failed.join(", ")}`,
  };
}

function selftest() {
  const original = readFileSync(FILES.parityDrawer, "utf8");
  if (!run().ok) {
    console.error(`${LABEL} SELFTEST FAIL: guard already red — ${run().message}`);
    process.exit(1);
  }
  const planted = original.replace('stackAboveModal ? "z-[218]" : "z-[60]"', '"z-[60]"');
  const caught = run((file, encoding) =>
    file === FILES.parityDrawer ? planted : readFileSync(file, encoding)
  );
  if (caught.ok || !caught.failed.includes("parity-z218")) {
    console.error(`${LABEL} SELFTEST FAIL: planted z-index regression not caught`, caught);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
