#!/usr/bin/env node
/** @matrix-built {"modules":["drivers","accounting"],"cols":["driver","connectivity","qbo_chrome"],"leaves":["drivers.modal.create_driver","bills.create.driver"],"task":"DRIVER-F6656-CREATE-DRAWER-DISCARD-LIFECYCLE","vertical":"class-sweep"} */
import fs from "node:fs";

const drawerFile = "apps/frontend/src/components/parity/ParityDrawer.tsx";
const driverFile = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";
const source = {
  drawer: fs.readFileSync(drawerFile, "utf8"),
  driver: fs.readFileSync(driverFile, "utf8"),
};

function failures(files = source) {
  const nestedDriverDrawerProps = files.driver.match(
    new RegExp('if \\(shell === "drawer"\\)[\\s\\S]*?<ParityDrawer([\\s\\S]*?)\\n        >')
  )?.[1] ?? "";
  const checks = [
    ["drawer exposes dirty-close contract", /confirmDiscardOnClose\?: boolean;[\s\S]*isDirty\?: boolean;[\s\S]*onRegisterAttemptClose\?:/.test(files.drawer)],
    ["drawer close attempts are guarded", /const attemptClose = useCallback\([\s\S]*confirmDiscardOnClose && isDirty[\s\S]*setShowDiscardConfirm\(true\)/.test(files.drawer)],
    ["escape uses guarded close", /if \(stackAboveModal\)[\s\S]*attemptClose\(\);/.test(files.drawer)],
    ["backdrop uses guarded close", /aria-hidden="true" onClick=\{attemptClose\}/.test(files.drawer)],
    ["close button uses guarded close", /aria-label="Close"[\s\S]{0,120}onClick=\{attemptClose\}/.test(files.drawer)],
    ["drawer renders discard confirmation", /<ConfirmDiscardDialog[\s\S]*open=\{showDiscardConfirm\}[\s\S]*onDiscard=\{finalizeClose\}/.test(files.drawer)],
    ["nested driver creator enables dirty protection", nestedDriverDrawerProps.includes('title="Create Driver"') && nestedDriverDrawerProps.includes("confirmDiscardOnClose") && nestedDriverDrawerProps.includes("isDirty={isDriverCreateDirty}")],
    ["nested driver creator registers guarded close", /onRegisterAttemptClose=\{\(fn\) => \{[\s\S]{0,150}driverCreateAttemptCloseRef\.current = fn/.test(nestedDriverDrawerProps)],
    ["driver Cancel uses registered guarded close", /onClick=\{\(\) => driverCreateAttemptCloseRef\.current\?\.\(\)\}/.test(files.driver)],
  ];
  return checks.filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["dirty gate", { ...source, drawer: source.drawer.replace("confirmDiscardOnClose && isDirty", "false") }],
    ["backdrop", { ...source, drawer: source.drawer.replace('aria-hidden="true" onClick={attemptClose}', 'aria-hidden="true" onClick={onClose}') }],
    ["close button", { ...source, drawer: source.drawer.replace("onClick={attemptClose}\n            className=\"min-h-11 rounded-sm px-2 text-gray-500", "onClick={onClose}\n            className=\"min-h-11 rounded-sm px-2 text-gray-500") }],
    ["driver opt-in", { ...source, driver: source.driver.replace("          confirmDiscardOnClose\n", "") }],
    ["driver cancel", { ...source, driver: source.driver.replace("onClick={() => driverCreateAttemptCloseRef.current?.()}", "onClick={onClose}") }],
  ];
  const escaped = mutations.filter(([, mutation]) => failures(mutation).length === 0).map(([name]) => name);
  if (escaped.length) {
    console.error(`verify-create-driver-drawer-discard-lifecycle SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-create-driver-drawer-discard-lifecycle selftest PASS — 5/5 planted defects rejected");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-create-driver-drawer-discard-lifecycle FAIL — ${missing.join("; ")}`);
  process.exit(1);
}
console.log("verify-create-driver-drawer-discard-lifecycle PASS — nested Create Driver preserves dirty drafts across every dismiss path");
