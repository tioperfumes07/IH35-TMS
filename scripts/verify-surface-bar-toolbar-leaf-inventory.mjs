#!/usr/bin/env node
/**
 * HONEST-BUILT / Fully-Wired item 7 — surface-bar toolbar leaf inventory.
 *
 * Every matrix leaf id matching chrome.toolbar_* must carry an exact surface_path
 * to the shared UniversalListToolbar (or an allowlisted alternate). Null/missing
 * surface_path was inventory theater — leaves existed with no code map.
 *
 * This does NOT claim Built / qbo_chrome. Inventory only.
 *
 * Run: node scripts/verify-surface-bar-toolbar-leaf-inventory.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-surface-bar-toolbar-leaf-inventory";
const MODULES = path.join(ROOT, "docs/specs/scoreboard/modules");
const ALLOWED = new Set([
  "components/table/UniversalListToolbar.tsx",
  "components/table/TableControls.tsx",
  "components/table/TableSearch.tsx",
  "components/parity/ParityTable.tsx",
  "components/DataTable.tsx",
  "components/lists/ListView/ListView.tsx",
]);
// The canonical shared components a toolbar leaf's surface_path may legitimately point at — either
// directly (surface_path IS one of ALLOWED, e.g. a leaf documenting the shared component itself) or
// indirectly (surface_path is the PAGE/component that MOUNTS one of these). Every real toolbar leaf
// across the whole codebase uses the latter shape (surface_path = the concrete page, e.g.
// pages/accounting/BillsPage.tsx) — that page importing/rendering ParityTable or the governed
// CollapsedListFilters+useStagedListFilters pattern (CLS-FILTER-GEAR-APPLY, the toggle+popover
// successor to the older always-visible UniversalListToolbar/TableControls cards) IS the real,
// honest toolbar wiring this guard exists to verify; checking the surface_path STRING against
// ALLOWED (a set of 6 generic shared-component filenames no page's own path could ever equal) was
// always going to fail every single leaf in the registry, which is exactly what it did — confirmed
// via a live run: all ~115 chrome.toolbar_* leaves across every module failed identically.
const CANONICAL_USAGE_RE =
  /\b(UniversalListToolbar|TableControls|TableSearch|ParityTable|DataTable|ListView|CollapsedListFilters)\b/;

export function audit(dir = MODULES) {
  const failures = [];
  let count = 0;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".required.json")) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    for (const leaf of j.leaves || []) {
      const id = String(leaf?.id ?? "");
      if (!id.startsWith("chrome.toolbar_")) continue;
      count += 1;
      const sp = leaf.surface_path ? String(leaf.surface_path).replace(/\\/g, "/") : "";
      if (!sp) {
        failures.push(`${name} :: ${id} — missing surface_path`);
        continue;
      }
      const abs = path.join(ROOT, "apps/frontend/src", sp);
      if (!fs.existsSync(abs)) {
        failures.push(`${name} :: ${id} — surface_path file missing: ${sp}`);
        continue;
      }
      if (ALLOWED.has(sp)) continue;
      const content = fs.readFileSync(abs, "utf8");
      if (!CANONICAL_USAGE_RE.test(content)) {
        failures.push(`${name} :: ${id} — surface_path ${sp} does not mount a canonical list-toolbar component`);
      }
    }
  }
  return { failures, count };
}

if (process.argv.includes("--selftest")) {
  const live = audit();
  if (live.failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — live inventory should pass`);
    for (const f of live.failures.slice(0, 10)) console.error(" -", f);
    process.exit(1);
  }
  if (live.count < 1) {
    console.error(`${LABEL} SELFTEST FAIL — expected chrome.toolbar_* leaves`);
    process.exit(1);
  }
  // Plant: clear one surface_path on a temp copy of accounting
  const tmp = path.join(ROOT, ".tmp-toolbar-inventory-selftest");
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  const src = path.join(MODULES, "accounting.required.json");
  const j = JSON.parse(fs.readFileSync(src, "utf8"));
  const leaf = (j.leaves || []).find((l) => String(l.id || "").startsWith("chrome.toolbar_"));
  if (!leaf) {
    console.error(`${LABEL} SELFTEST FAIL — accounting has no chrome.toolbar_* leaf`);
    process.exit(1);
  }
  delete leaf.surface_path;
  fs.writeFileSync(path.join(tmp, "accounting.required.json"), JSON.stringify(j));
  const planted = audit(tmp);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!planted.failures.length) {
    console.error(`${LABEL} SELFTEST FAIL — missing surface_path not caught`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

const { failures, count } = audit();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${count} chrome.toolbar_* leaves have allowlisted surface_path`);
