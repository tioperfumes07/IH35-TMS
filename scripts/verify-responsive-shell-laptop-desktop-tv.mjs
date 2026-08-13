#!/usr/bin/env node
/**
 * CLS-RESPONSIVE-SHELL — laptop → desktop → TV must be named and wired.
 *
 * Root cause: shell had mobile + ultrawide edge rules but no single ratcheting
 * contract for the laptop/desktop/TV continuum owner chrome law requires.
 *
 * Usage:
 *   node scripts/verify-responsive-shell-laptop-desktop-tv.mjs
 *   node scripts/verify-responsive-shell-laptop-desktop-tv.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FILES = {
  shellCss: "apps/frontend/src/styles/responsive-shell.css",
  breakpoints: "apps/frontend/src/styles/responsive-breakpoints.css",
  edge: "apps/frontend/src/styles/breakpoints-edge.css",
  shellTsx: "apps/frontend/src/components/Shell.tsx",
  ultra: "apps/frontend/src/components/layout/UltraWideContainer.tsx",
  modal: "apps/frontend/src/components/Modal.tsx",
  drawer: "apps/frontend/src/components/parity/ParityDrawer.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function run() {
  const errors = [];
  const shellCss = read(FILES.shellCss);
  for (const marker of [
    "CLS-RESPONSIVE-SHELL",
    "min-width: 1024px",
    "max-width: 1439px",
    "min-width: 1440px",
    "max-width: 1919px",
    "min-width: 1920px",
    "--ih35-shell-tier: laptop",
    "--ih35-shell-tier: desktop",
    "--ih35-shell-tier: tv",
  ]) {
    if (!shellCss.includes(marker)) errors.push(`responsive-shell.css missing: ${marker}`);
  }

  const bp = read(FILES.breakpoints);
  if (!bp.includes("max-width: 1279px")) errors.push("responsive-breakpoints.css must keep topbar stack ≤1279px");

  const edge = read(FILES.edge);
  if (!edge.includes("@media (min-width: 1920px)") || !edge.includes("max-width: 1800px")) {
    errors.push("breakpoints-edge.css must keep TV ultrawide content cap");
  }

  const shell = read(FILES.shellTsx);
  if (!shell.includes("responsive-shell.css")) errors.push("Shell.tsx must import responsive-shell.css");
  if (!shell.includes('data-ih35-shell="laptop-desktop-tv"')) {
    errors.push("Shell.tsx must set data-ih35-shell=laptop-desktop-tv");
  }
  if (!shell.includes("ih35-responsive-shell")) errors.push("Shell.tsx must apply ih35-responsive-shell");
  if (!shell.includes("ih35-main-shell")) errors.push("Shell.tsx main must use ih35-main-shell");
  if (!shell.includes("UltraWideContainer")) errors.push("Shell.tsx must wrap children in UltraWideContainer");

  const ultra = read(FILES.ultra);
  if (!ultra.includes("edge-ultrawide-shell") || !ultra.includes("breakpoints-edge.css")) {
    errors.push("UltraWideContainer must keep edge-ultrawide-shell + breakpoints-edge import");
  }

  const modal = read(FILES.modal);
  if (!modal.includes("calc(100vw-2rem)") && !modal.includes("100vw")) {
    errors.push("Modal.tsx must bound width to viewport (100vw)");
  }

  const drawer = read(FILES.drawer);
  if (!drawer.includes("data-parity-drawer")) {
    errors.push("ParityDrawer must expose data-parity-drawer for shell TV rules");
  }
  if (!drawer.includes("w-full sm:w-") && !/PARITY_DRAWER_WIDTH/.test(drawer)) {
    errors.push("ParityDrawer must stay full-bleed on small + bounded on sm+");
  }

  if (errors.length) {
    console.error("verify-responsive-shell-laptop-desktop-tv FAIL:");
    for (const e of errors) console.error(" -", e);
    process.exit(1);
  }
  console.log(
    "verify-responsive-shell-laptop-desktop-tv OK — laptop/desktop/TV tiers + Shell + UltraWide + Modal/Drawer bounds",
  );
}

function selftest() {
  const target = path.join(ROOT, FILES.shellCss);
  const bak = fs.readFileSync(target, "utf8");
  try {
    fs.writeFileSync(target, bak.replace(/--ih35-shell-tier: laptop/g, "--ih35-shell-tier: REMOVED"));
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if (red.status === 0) {
      console.error("selftest FAIL — expected red after removing laptop tier");
      process.exit(1);
    }
    console.log("selftest OK — red when laptop tier removed");
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
