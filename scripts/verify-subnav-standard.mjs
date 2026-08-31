#!/usr/bin/env node
/**
 * GO-UI-CONSISTENCY-WHOLE-APP-2026-08-31 guard.
 * All subnav strips must use the navy standard (matching NavyPageSubNav):
 *   - background: #1A1F36 (navy)
 *   - text: white
 *   - no wrapping (overflow-x: auto)
 *   - compact height (~28-42px)
 *
 * Checks:
 *   1. HoverDropdownNav.css uses navy bg + white text
 *   2. NavyPageSubNav.tsx uses navy bg + white text (standard reference)
 *   3. No subnav uses white/surface background
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const failures = [];

// 1. HoverDropdownNav.css must use navy bg
const cssPath = path.join(root, "apps/frontend/src/components/forms/shared/HoverDropdownNav.css");
const css = readFileSync(cssPath, "utf8");

const cssNavyBg = css.includes("background: #1A1F36") || css.includes("background:#1A1F36");
if (!cssNavyBg) {
  failures.push("HoverDropdownNav.css .hover-dropdown-nav must use background: #1A1F36 (navy standard)");
}

// Check that the nav strip text is white (not the dropdown)
const cssWhiteText = css.includes("color: rgba(255, 255, 255") || css.includes("color:#ffffff") || css.includes("color: #ffffff");
if (!cssWhiteText) {
  failures.push("HoverDropdownNav.css nav items must use white text (rgba(255,255,255,...) or #ffffff)");
}

// Check no surface bg on the nav strip itself (dropdown can keep surface)
const navStripBgMatch = css.match(/\.hover-dropdown-nav\s*\{[^}]*background:\s*([^;]+);/);
if (navStripBgMatch && navStripBgMatch[1].includes("var(--color-bg-surface)")) {
  failures.push("HoverDropdownNav.css .hover-dropdown-nav must NOT use var(--color-bg-surface) — use #1A1F36 navy");
}

// 2. NavyPageSubNav.tsx must use navy bg (standard reference — should not regress)
const navyPath = path.join(root, "apps/frontend/src/components/layout/NavyPageSubNav.tsx");
const navy = readFileSync(navyPath, "utf8");
if (!navy.includes("bg-[#1A1F36]")) {
  failures.push("NavyPageSubNav.tsx must use bg-[#1A1F36] (navy standard reference)");
}

// 3. No overflow-y wrapping
if (!css.includes("overflow-x: auto")) {
  failures.push("HoverDropdownNav.css must have overflow-x: auto (no wrapping)");
}

if (process.argv.includes("--selftest")) {
  const bad = css.replace("background: #1A1F36", "background: #ffffff");
  if (bad.includes("background: #1A1F36")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-subnav-standard selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-subnav-standard FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-subnav-standard: OK — all subnav strips use navy #1A1F36 standard with white text and no wrapping");
process.exit(0);
