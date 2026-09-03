#!/usr/bin/env node
/**
 * verify-accounting-subnav-click-reachability.mjs
 *
 * GO-23 nav-dropdown-clip regression guard (owner FINISH-LAW report 2026-09-03: "Load costs"
 * unreachable from the Accounting nav except by typing the URL directly).
 *
 * ROOT CAUSE (confirmed live in Chrome, not guessed): `.hover-dropdown-nav { overflow-x: auto }`
 * forces the CSS Overflow spec's paired `overflow-y` to also compute `auto` on that SAME element
 * (getComputedStyle confirmed overflowY:"auto" even though only overflow-x was authored). Every
 * `.nav-dropdown` menu is `position: absolute` inside `.nav-item-with-dropdown`, a descendant of
 * that clipping ancestor -- it renders correctly in the DOM (real links, real hrefs, opacity:1,
 * display:block) but is cropped off-screen. Verified live on ALL SIX Accounting dropdown groups
 * (Bills / Expenses / Bill payment / Invoices / Maintenance & shop / More): one bug in
 * HoverDropdownNav.css, not five, zero console errors on click (pure CSS defect).
 *
 * FIX: HoverDropdownNav.tsx renders each open `.nav-dropdown` into a document.body portal,
 * positioned via measureNavDropdownStyle() (position:fixed, live getBoundingClientRect()) -- the
 * same fix already proven for this exact clipping class in components/Combobox.tsx.
 *
 * This guard fails if:
 *   - The regression test file is missing.
 *   - The test file drops its structural "menu escaped .hover-dropdown-nav" assertion (the one
 *     that actually distinguishes fixed from broken -- confirmed by negative control: this
 *     assertion fails against the pre-fix position:absolute markup, passes against the portal fix).
 *   - vitest reports a failure for that file.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_FILE =
  "apps/frontend/src/pages/accounting/__tests__/accounting-subnav-click-reachability.test.tsx";
const LABEL = "verify-accounting-subnav-click-reachability";

const errors = [];

if (!fs.existsSync(path.join(ROOT, TEST_FILE))) {
  errors.push(`MISSING test file: ${TEST_FILE}`);
}

const testSrc = fs.existsSync(path.join(ROOT, TEST_FILE))
  ? fs.readFileSync(path.join(ROOT, TEST_FILE), "utf8")
  : "";

const required = [
  ["ACCOUNTING_SUB_NAV_ITEMS", "must render the REAL manifest, not a hand-rolled fixture"],
  ["fireEvent.click(trigger)", "must open the dropdown by a real click, not hover or a state hack"],
  ["nav.contains(menu)", "must assert the open menu escaped the .hover-dropdown-nav clipping ancestor"],
  ["document.body.contains(menu)", "must assert the menu portal-attached to document.body"],
  ["no reachable <a href=", "must assert every declared child href is a real clickable link, not just declared"],
];
for (const [needle, why] of required) {
  if (!testSrc.includes(needle)) {
    errors.push(`${TEST_FILE} missing assertion: "${needle}" (${why})`);
  }
}

if (errors.length) {
  console.error(`[${LABEL}] FAIL (static checks)`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

try {
  execSync(`npx vitest run ${TEST_FILE.replace(/^apps\/frontend\//, "")}`, {
    cwd: path.join(ROOT, "apps/frontend"),
    stdio: "inherit",
  });
} catch {
  console.error(`[${LABEL}] FAIL — vitest run failed`);
  process.exit(1);
}

console.log(
  `[${LABEL}] PASS — every leaf href in ACCOUNTING_SUB_NAV_ITEMS is reachable by an actual click, ` +
    `menus escape .hover-dropdown-nav's clipping ancestor (GO-23 nav-dropdown-clip fixed)`,
);
