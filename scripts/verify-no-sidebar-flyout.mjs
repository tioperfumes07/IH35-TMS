#!/usr/bin/env node
/**
 * verify-no-sidebar-flyout.mjs — anti-regression guard.
 *
 * Jorge's locked design (§7): ONE 80px navy sidebar (`Sidebar.tsx`), no second
 * left panel, no accordion left tree, no hover-triggered flyout submenu off the
 * sidebar. `SidebarFlyoutMenu.tsx` (a hover-flyout submenu component) has been
 * built and deleted TWICE already (2026 sweeps) because a bespoke pattern was
 * already implemented live and the flyout kept getting silently re-added.
 * This guard makes a third re-add fail CI instead of drifting back in.
 *
 * CHECK A — component-file reintroduction:
 *   Fails if any *.ts/*.tsx file under apps/frontend/src has a basename
 *   matching /SidebarFlyout/i or /FlyoutMenu/i (test/stories files excluded —
 *   a unit test asserting the absence of the pattern is fine).
 *
 * CHECK B — live sidebar wiring:
 *   Fails if the single live sidebar component (`components/Sidebar.tsx`)
 *   itself contains the word "flyout" (case-insensitive) or imports anything
 *   with "Flyout" in its module specifier. Scoped to this one file (not a
 *   repo-wide keyword scan) so unrelated, legitimately-named flyout/hover-nav
 *   components elsewhere (e.g. reports category hover-nav, lists domain
 *   flyout) never false-positive this guard — those are not the sidebar.
 *
 * Non-financial tooling — auto-merge on green CI.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps", "frontend", "src");
const SIDEBAR_FILE = path.join(SRC, "components", "Sidebar.tsx");

const FILENAME_PATTERN = /SidebarFlyout|FlyoutMenu/i;
const TEST_OR_STORY = /\.(test|spec|stories)\.[jt]sx?$/i;

/** @type {string[]} */
const failures = [];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (/\.[jt]sx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// --- CHECK A: reintroduced component file --------------------------------
const allFiles = walk(SRC);
for (const file of allFiles) {
  const base = path.basename(file);
  if (TEST_OR_STORY.test(base)) continue;
  if (FILENAME_PATTERN.test(base)) {
    failures.push(
      `CHECK A: reintroduced sidebar-flyout component file: ${path.relative(ROOT, file)}\n` +
        `  Jorge's §7 lock: a single 80px navy sidebar, no hover-flyout submenu. ` +
        `This pattern was already built+deleted twice — do not re-add it.`,
    );
  }
}

// --- CHECK B: live sidebar wiring ------------------------------------------
if (!fs.existsSync(SIDEBAR_FILE)) {
  failures.push(
    `CHECK B: expected live sidebar component missing at ${path.relative(ROOT, SIDEBAR_FILE)} ` +
      `— guard cannot verify it is flyout-free. If Sidebar.tsx moved, update SIDEBAR_FILE in this script.`,
  );
} else {
  const source = fs.readFileSync(SIDEBAR_FILE, "utf8");
  if (/flyout/i.test(source)) {
    failures.push(
      `CHECK B: components/Sidebar.tsx references "flyout" — the live sidebar must never ` +
        `render a hover-triggered flyout submenu (§7: single 80px navy sidebar only).`,
    );
  }
  const importFlyoutRe = /import\s+[^;]*from\s+["'][^"']*flyout[^"']*["']/gi;
  if (importFlyoutRe.test(source)) {
    failures.push(
      `CHECK B: components/Sidebar.tsx imports a module whose path contains "flyout" — ` +
        `the live sidebar must not wire in a flyout submenu component.`,
    );
  }
}

if (failures.length > 0) {
  console.error("verify:no-sidebar-flyout FAILED\n");
  for (const f of failures) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log("verify:no-sidebar-flyout OK — no sidebar hover-flyout submenu found.");
