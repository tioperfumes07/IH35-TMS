#!/usr/bin/env node
/**
 * HoverDropdown menu must close when a child link/button/menuitem is clicked.
 * SAFETY-DRIVER-FILES-DETAIL-STUCK-ON-NAV-AWAY contributing factor fix —
 * the menu stayed mounted-open across navigation because it had no onClick
 * handler to close on child link clicks.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/shared/HoverDropdown.tsx");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: onClick handler on the menu div
if (!src.includes('onClick={(event) => {')) {
  failures.push("HoverDropdown menu missing onClick handler");
}

// Required: closeNow called from the menu onClick
if (!src.includes("closeNow();")) {
  failures.push("HoverDropdown menu onClick must call closeNow");
}

// Required: checks for a, button, or menuitem closest
if (!src.includes("closest(\"a, button, [role='menuitem']\")")) {
  failures.push("HoverDropdown menu onClick must detect child link/button/menuitem clicks");
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace("closest(\"a, button, [role='menuitem']\")", "closest(\".nonexistent\")");
  if (bad.includes("closest(\"a, button, [role='menuitem']\")")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-hover-dropdown-close-on-menu-click selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-hover-dropdown-close-on-menu-click FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-hover-dropdown-close-on-menu-click: OK — HoverDropdown menu closes on child link/button click");
process.exit(0);
