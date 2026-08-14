#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["trailer"],"leafRe":"^(load\\.detail|load\\.drawer\\.overview|dispatch\\.drawer\\.load_detail)$","task":"LINK-F5163-DISPATCH-LOAD-DRAWER-TRAILER"} */
/** @matrix-built {"modules":["dispatch"],"cols":["trailer"],"leafRe":"^dispatch\\.modal\\.quick_assign$","task":"LINK-F5163-DISPATCH-QUICK-ASSIGN-TRAILER"} */
/** @matrix-built {"modules":["dispatch"],"cols":["trailer"],"leafRe":"^(docs\\.equipment_transfers|dispatch\\.modal\\.equipment_transfer)$","task":"LINK-F5163-DISPATCH-EQUIPMENT-TRANSFER-TRAILER"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14):
 * - load.detail / load.drawer.overview / dispatch.drawer.load_detail all resolve to
 *   LoadDetailDrawer.tsx's default Overview tab, which renders a real
 *   EntityLink kind="trailer" id={load.trailer_id}.
 * - dispatch.modal.quick_assign: pages/dispatch/components/QuickAssignModal.tsx has a real
 *   EntityPicker kind="trailer".
 * - docs.equipment_transfers: EquipmentTransferRequests.tsx mounts EquipmentTransferModal.tsx,
 *   which has a real EntityPicker kind="trailer" — dispatch.modal.equipment_transfer is that same
 *   modal component.
 *
 * Self-test: node scripts/verify-dispatch-trailer-drawer-assign-transfer.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  quickAssign: "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx",
  transferRequests: "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
  transferModal: "apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx",
};
const LABEL = "verify-dispatch-trailer-drawer-assign-transfer";

export function audit(src) {
  const failures = [];
  if (!/kind="trailer"[\s\S]{0,60}id=\{load\.trailer_id\}/.test(src.drawer)) {
    failures.push(`${FILES.drawer}: Load Detail Drawer must render a real EntityLink kind="trailer" for this load`);
  }
  if (!/kind="trailer"/.test(src.quickAssign)) {
    failures.push(`${FILES.quickAssign}: dispatch Quick Assign must have a real trailer picker`);
  }
  if (!/<EquipmentTransferModal/.test(src.transferRequests)) {
    failures.push(`${FILES.transferRequests}: equipment transfer requests must mount the real EquipmentTransferModal`);
  }
  if (!/kind="trailer"/.test(src.transferModal)) {
    failures.push(`${FILES.transferModal}: EquipmentTransferModal must have a real trailer picker`);
  }
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["drawer-entitylink", "drawer", /kind="trailer"/, 'kind="unit"'],
    ["quick-assign-kind", "quickAssign", /kind="trailer"/g, 'kind="unit"'],
    ["transfer-requests-mount", "transferRequests", /<EquipmentTransferModal/g, "<div"],
    ["transfer-modal-kind", "transferModal", /kind="trailer"/g, 'kind="unit"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — load drawer, quick-assign, and equipment-transfer trailer wiring are real`);
