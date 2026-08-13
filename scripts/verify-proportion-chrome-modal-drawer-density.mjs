#!/usr/bin/env node
/**
 * CLS-PROPORTION-CHROME — modal/side-panel density vs QBO approved chrome.
 *
 * Root cause: shared Modal / ParityDrawer lacked a ratcheting density contract
 * (field height + chrome padding), so individual surfaces ballooned with p-8 /
 * tall fields and drifted from approved screens.
 *
 * Usage:
 *   node scripts/verify-proportion-chrome-modal-drawer-density.mjs
 *   node scripts/verify-proportion-chrome-modal-drawer-density.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FILES = {
  css: "apps/frontend/src/styles/proportion-chrome.css",
  sizing: "apps/frontend/src/components/parity/sizing.ts",
  modal: "apps/frontend/src/components/Modal.tsx",
  drawer: "apps/frontend/src/components/parity/ParityDrawer.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function run() {
  const errors = [];
  const css = read(FILES.css);
  for (const m of [
    "CLS-PROPORTION-CHROME",
    'data-proportion-chrome="qbo-compact"',
    "--ih35-field-height: 38px",
    "--ih35-chrome-pad-x: 1rem",
    "--ih35-chrome-pad-y: 0.75rem",
  ]) {
    if (!css.includes(m)) errors.push(`proportion-chrome.css missing: ${m}`);
  }

  const sizing = read(FILES.sizing);
  if (!sizing.includes("fieldHeightPx: 38")) errors.push("sizing.ts must keep fieldHeightPx: 38");
  if (!sizing.includes("PARITY_FIELD_HEIGHT_CLASS")) errors.push("sizing.ts must export PARITY_FIELD_HEIGHT_CLASS");
  if (!sizing.includes("chromePadXPx: 16") || !sizing.includes("chromePadYPx: 12")) {
    errors.push("sizing.ts must export chromePadXPx/chromePadYPx matching px-4/py-3");
  }

  const modal = read(FILES.modal);
  if (!modal.includes("proportion-chrome.css")) errors.push("Modal.tsx must import proportion-chrome.css");
  if (!modal.includes('data-proportion-chrome="qbo-compact"')) {
    errors.push("Modal.tsx must set data-proportion-chrome=qbo-compact");
  }
  if (!modal.includes("px-4 py-3")) errors.push("Modal.tsx header/body must keep px-4 py-3 density");
  if (/\bclassName="[^"]*\bp-8\b/.test(modal) || /\bpy-8\b/.test(modal)) {
    errors.push("Modal.tsx must not use balloon p-8/py-8 on the shared shell");
  }

  const drawer = read(FILES.drawer);
  if (!drawer.includes("proportion-chrome.css")) errors.push("ParityDrawer must import proportion-chrome.css");
  if (!drawer.includes('data-proportion-chrome="qbo-compact"')) {
    errors.push("ParityDrawer must set data-proportion-chrome=qbo-compact");
  }
  if (!drawer.includes("px-4 py-3")) errors.push("ParityDrawer must keep px-4 py-3 chrome padding");
  if (/\bp-8\b/.test(drawer) || /\bpy-8\b/.test(drawer)) {
    errors.push("ParityDrawer must not use balloon p-8/py-8");
  }

  if (errors.length) {
    console.error("verify-proportion-chrome-modal-drawer-density FAIL:");
    for (const e of errors) console.error(" -", e);
    process.exit(1);
  }
  console.log(
    "verify-proportion-chrome-modal-drawer-density OK — Modal+ParityDrawer qbo-compact density + 38px field token",
  );
}

function selftest() {
  const target = path.join(ROOT, FILES.css);
  const bak = fs.readFileSync(target, "utf8");
  try {
    fs.writeFileSync(target, bak.replace(/38px/g, "99px"));
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (red.status === 0) {
      console.error("selftest FAIL — expected red after mutating field height");
      process.exit(1);
    }
    console.log("selftest OK — red when field height mutated");
  } finally {
    fs.writeFileSync(target, bak);
  }
  const green = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (green.status !== 0) {
    console.error(green.stderr || green.stdout);
    console.error("selftest FAIL — expected green after restore");
    process.exit(1);
  }
  console.log("selftest OK — green on restore");
}

if (process.argv.includes("--selftest")) selftest();
else run();
