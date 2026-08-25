#!/usr/bin/env node
/** @matrix-built {"modules":["banking"],"cols":["connectivity","qbo_chrome"],"leaves":["banking.modal.manage_accounts"],"task":"CLASS-MODAL-SIZE-PREFERENCE-FAILURE-VISIBLE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["fleet"],"cols":["connectivity"],"leaves":["fleet.modal.edit_vehicle"],"task":"CLASS-MODAL-SIZE-PREFERENCE-FAILURE-VISIBLE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leaves":["maintenance.modal.work_order_detail"],"task":"CLASS-MODAL-SIZE-PREFERENCE-FAILURE-VISIBLE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["tasks"],"cols":["connectivity","qbo_chrome"],"leaves":["tasks.drawer.task"],"task":"CLASS-MODAL-SIZE-PREFERENCE-FAILURE-VISIBLE","vertical":"class-sweep"} */
/** @matrix-built {"modules":["customers"],"cols":["connectivity","qbo_chrome"],"leaves":["customers.modal.customer_drill","customers.modal.customer_edit"],"task":"CLASS-MODAL-SIZE-PREFERENCE-FAILURE-VISIBLE","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const FRONTEND_ROOT = path.join(ROOT, "apps/frontend/src");
const SHARED_MODAL = path.join(FRONTEND_ROOT, "components/Modal.tsx");
const SIZE_TEST = path.join(FRONTEND_ROOT, "components/__tests__/modal-size-preference-failure.test.tsx");
const PERSISTED_SIZE_SURFACES = [
  ["pages/banking/components/ManageAccountsModal.tsx", 'modalKind="banking-manage-accounts"'],
  ["components/fleet/EditVehicleModal.tsx", 'modalKind="edit-vehicle"'],
  ["components/maintenance/WorkOrderDetailModal.tsx", 'modalKind="work_order_detail"'],
  ["components/tasks/TaskLinkPicker.tsx", 'modalKind="link-task"'],
  ["components/customers/CustomerEditModal.tsx", 'modalKind="customer-edit"'],
  ["components/customers/CustomerDrillModal.tsx", 'modalKind="customer_drill"'],
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/Modal\.tsx$/.test(entry.name)) out.push(p);
  }
  return out;
}

function isReExportOnly(source) {
  if (/export\s+function\s+/.test(source)) return false;
  if (/export\s+default\s+function/.test(source)) return false;
  return /^export\s+\{[^}]+\}\s+from\s+["'][^"']+["'];?\s*$/m.test(source.trim());
}

function hasModalNoX(source) {
  return /\/\/\s*@ModalNoX\b/.test(source);
}

function hasXCloseContract(source) {
  if (/<InvoiceTypeModalBase[\s/>]/.test(source)) {
    return true;
  }
  if (/<Modal[\s/>]/.test(source) && /from\s+["'][^"']*\/Modal["']/.test(source)) {
    return true;
  }
  // Owner creator-chrome lock: ParityDrawer ships a header ✕ with aria-label="Close".
  if (/<ParityDrawer[\s/>]/.test(source) && /from\s+["'][^"']*parity\/ParityDrawer["']/.test(source)) {
    return true;
  }
  if (/ModalCloseButton/.test(source)) {
    return true;
  }
  if (/aria-label=\{[^}]*modalCloseAriaLabel/.test(source)) {
    return true;
  }
  // Both "Close" on its own (bare — the common case, e.g. AddPartsLinkModal.tsx) and "Close <rest>"
  // (e.g. "Close dialog") are honest close-button labels. The original regex's trailing `\s`
  // required a word AFTER "Close", so a bare aria-label="Close" (no trailing space before the
  // closing quote) never matched.
  if (/aria-label=["'`]Close(\s|["'`])/.test(source)) {
    return true;
  }
  if (/aria-label=\{`Close\s\$\{/.test(source) || /aria-label=\{modalCloseAriaLabel/.test(source)) {
    return true;
  }
  return false;
}

const violations = [];
const inventory = [];
const exempt = [];

for (const file of walk(FRONTEND_ROOT)) {
  const rel = path.relative(ROOT, file);
  if (rel.endsWith("components/Modal.tsx")) continue;

  const source = fs.readFileSync(file, "utf8");
  inventory.push(rel);

  if (isReExportOnly(source)) continue;
  if (hasModalNoX(source)) {
    exempt.push(rel);
    continue;
  }
  if (!hasXCloseContract(source)) {
    violations.push(`${rel}: missing shared Modal, ModalCloseButton, or aria-label starting with "Close"`);
  }
}

function modalPreferenceViolations(modalSource, testSource) {
  const out = [];
  const required = [
    ["visible preference error", /data-modal-size-preference-error/],
    ["accessible alert", /role="alert"/],
    ["honest temporary-state copy", /Modal size was not saved\. Your current size is temporary\./],
    ["load failure copy", /Saved modal size is unavailable\. Using a temporary default\./],
    ["retry exact failed dimensions", /failedSizeRef\.current = next[\s\S]*saveModalSize\(failedSizeRef\.current\)/],
    ["write retry control", /Retry save/],
    ["read retry control", /Retry load/],
    ["query refetch", /prefsQuery\.refetch\(\)/],
  ];
  for (const [name, pattern] of required) if (!pattern.test(modalSource)) out.push(name);
  if (/persistModalSize\([^)]*\)\.catch\(\(\) => undefined\)/.test(modalSource)) out.push("silent save swallow remains");
  if (!/mockRejectedValue\(new Error\("preferences unavailable"\)\)/.test(testSource)) out.push("load rejection test");
  if (!/mockRejectedValueOnce\(new Error\("save unavailable"\)\)/.test(testSource)) out.push("save rejection test");
  if (!/mock\.calls\[1\]\?\.\[1\]\)\.toEqual\(failedSize\)/.test(testSource)) out.push("same-dimensions retry assertion");
  return out;
}

const modalSource = fs.readFileSync(SHARED_MODAL, "utf8");
const sizeTestSource = fs.readFileSync(SIZE_TEST, "utf8");
for (const gap of modalPreferenceViolations(modalSource, sizeTestSource)) {
  violations.push(`shared Modal size persistence: ${gap}`);
}
for (const [relativeFile, token] of PERSISTED_SIZE_SURFACES) {
  const source = fs.readFileSync(path.join(FRONTEND_ROOT, relativeFile), "utf8");
  if (!source.includes(token)) violations.push(`${relativeFile}: missing exact persisted-size contract ${token}`);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["remove alert", modalSource.replace('role="alert"', 'role="status"'), sizeTestSource],
    ["restore silent save", modalSource.replace("void saveModalSize(b);", "void persistModalSize(modalKind, b).catch(() => undefined);"), sizeTestSource],
    ["drop failed draft", modalSource.replace("failedSizeRef.current = next;", "failedSizeRef.current = null;"), sizeTestSource],
    ["drop save retry", modalSource.replace("Retry save", "Save unavailable"), sizeTestSource],
    ["drop load retry", modalSource.replace("Retry load", "Load unavailable"), sizeTestSource],
    ["drop rejected-save test", modalSource, sizeTestSource.replace('mockRejectedValueOnce(new Error("save unavailable"))', "mockResolvedValueOnce(undefined)")],
  ];
  const escaped = mutations.filter(([, modal, test]) => modalPreferenceViolations(modal, test).length === 0);
  if (escaped.length) {
    console.error("verify:all-modals-have-x-close SELFTEST FAIL");
    for (const [name] of escaped) console.error(`- mutation escaped: ${name}`);
    process.exit(1);
  }
  console.log(`verify:all-modals-have-x-close SELFTEST PASS (${mutations.length}/${mutations.length} planted preference defects rejected)`);
  process.exit(0);
}

if (violations.length > 0) {
  console.error("verify:all-modals-have-x-close FAIL");
  for (const v of violations) console.error(`- ${v}`);
  process.exit(1);
}

console.log(`verify:all-modals-have-x-close PASS (${inventory.length} Modal.tsx files, ${exempt.length} @ModalNoX exempt; shared size failures visible)`);
