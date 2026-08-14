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
      if (!ALLOWED.has(sp)) {
        failures.push(`${name} :: ${id} — surface_path ${sp} not in toolbar allowlist`);
      }
      const abs = path.join(ROOT, "apps/frontend/src", sp);
      if (!fs.existsSync(abs)) {
        failures.push(`${name} :: ${id} — surface_path file missing: ${sp}`);
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
