#!/usr/bin/env node
/**
 * verify-nav-pattern.mjs
 *
 * CI guard for IH35-TMS Navigation Pattern Rule (locked rule #20).
 * Spec: docs/specs/NAVIGATION-PATTERN-RULE.md
 *
 * Rules enforced:
 *   1. WARN (exit 0)  — SidebarFlyoutMenu.tsx exists (grandfathered; needs future correction).
 *   2. HARD FAIL      — Any NEW flyout-style component (*FlyoutMenu*, *SidebarDropdown*,
 *                        *SidebarSubmenu*) is imported in Sidebar.tsx beyond the
 *                        grandfathered SidebarFlyoutMenu.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SIDEBAR_PATH = resolve(ROOT, "apps/frontend/src/components/Sidebar.tsx");
const FLYOUT_PATH = resolve(ROOT, "apps/frontend/src/components/SidebarFlyoutMenu.tsx");

/** Patterns that identify forbidden flyout-style components (case-insensitive name match). */
const FORBIDDEN_PATTERNS = [/FlyoutMenu/i, /SidebarDropdown/i, /SidebarSubmenu/i];

/** The one grandfathered import that is allowed (exact string). */
const GRANDFATHERED_IMPORT = "SidebarFlyoutMenu";

let exitCode = 0;

// ── Rule 1: Warn if grandfathered file still exists ──────────────────────────
if (existsSync(FLYOUT_PATH)) {
  console.warn(
    "[nav-pattern] WARN: SidebarFlyoutMenu.tsx exists and violates the flat-sidebar rule.\n" +
      "  This file is grandfathered as of 2026-06-07 and must be removed in a future corrective block.\n" +
      "  See docs/specs/NAVIGATION-PATTERN-RULE.md § Current Drift Status."
  );
} else {
  console.log("[nav-pattern] OK: SidebarFlyoutMenu.tsx has been removed — drift resolved.");
}

// ── Rule 2: Hard-fail on NEW forbidden imports in Sidebar.tsx ─────────────────
if (!existsSync(SIDEBAR_PATH)) {
  console.error(`[nav-pattern] ERROR: Sidebar.tsx not found at expected path:\n  ${SIDEBAR_PATH}`);
  process.exit(1);
}

const sidebarSource = readFileSync(SIDEBAR_PATH, "utf8");

// Extract all import specifiers (both named and default)
const importedNames = [];
for (const match of sidebarSource.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from/g)) {
  const named = match[1] ? match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0].trim()) : [];
  const def = match[2] ? [match[2]] : [];
  importedNames.push(...named, ...def);
}

const violations = importedNames.filter((name) => {
  if (name === GRANDFATHERED_IMPORT) return false; // allowed (grandfathered)
  return FORBIDDEN_PATTERNS.some((pattern) => pattern.test(name));
});

if (violations.length > 0) {
  console.error(
    "[nav-pattern] FAIL: New flyout-style component(s) detected in Sidebar.tsx — this violates locked rule #20.\n" +
      "  Forbidden imports found: " +
      violations.join(", ") +
      "\n" +
      "  Sub-navigation must live in the top-bar HoverDropdownNav, not the sidebar.\n" +
      "  See docs/specs/NAVIGATION-PATTERN-RULE.md"
  );
  exitCode = 1;
} else {
  console.log(
    "[nav-pattern] OK: No new flyout-style components imported in Sidebar.tsx."
  );
}

process.exit(exitCode);
