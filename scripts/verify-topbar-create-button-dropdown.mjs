#!/usr/bin/env node
/**
 * Topbar global Create button must open a dropdown menu with navigation items.
 * HEADER-CREATE-BUTTON-DEAD-CLICK guard — the button was a dead click on some
 * pages because it had no handler. Now it toggles a dropdown with create actions.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/Topbar.tsx");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: Create button with onClick toggling createOpen
if (!src.includes('setCreateOpen((v) => !v)')) {
  failures.push("Topbar Create button missing onClick toggle for createOpen");
}

// Required: createOpen state
if (!src.includes("createOpen")) {
  failures.push("Topbar missing createOpen state");
}

// Required: dropdown menu with data-testid
if (!src.includes('data-testid="global-create-menu"')) {
  failures.push("Topbar missing global-create-menu dropdown");
}

// Required: at least Customer and Invoice create actions
if (!src.includes("/customers?create=1")) {
  failures.push("Topbar Create menu missing Customer create action");
}
if (!src.includes("/accounting/invoices?create=1")) {
  failures.push("Topbar Create menu missing Invoice create action");
}

// Required: outside-click handler
if (!src.includes("createMenuRef")) {
  failures.push("Topbar missing createMenuRef for outside-click close");
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace('setCreateOpen((v) => !v)', 'setCreateOpen(v => v)');
  if (bad.includes("setCreateOpen((v) => !v)")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-topbar-create-button-dropdown selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-topbar-create-button-dropdown FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-topbar-create-button-dropdown: OK — Topbar Create button toggles dropdown with create actions");
process.exit(0);
