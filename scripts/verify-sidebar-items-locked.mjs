#!/usr/bin/env node
// Guard (Block 02) — sidebar nav config items can't silently DROP. The left sidebar had no protection
// against a config id disappearing between agent handoffs ("features vanish and nobody notices"). This
// locks SIDEBAR_ITEM_IDS in components/layout/sidebar-config.ts against a committed baseline.
//
// Contract: REMOVING a baseline id fails CI. ADDING a new id is allowed — but the PR that adds it must
// update scripts/baselines/sidebar-item-ids.json in the same change (run with --update). Hiding an item
// (NAV_HIDDEN_STUB_IDS) is a render choice and is NOT governed here — only deletion of the CONFIG entry.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIG = "apps/frontend/src/components/layout/sidebar-config.ts";
const BASELINE = "scripts/baselines/sidebar-item-ids.json";
const fail = (m) => { console.error(`FAIL verify-sidebar-items-locked: ${m}`); process.exit(1); };

const src = readFileSync(join(root, CONFIG), "utf8");
const m = src.match(/SIDEBAR_ITEM_IDS\s*=\s*\[([\s\S]*?)\]/);
if (!m) fail(`${CONFIG}: SIDEBAR_ITEM_IDS array not found`);
const current = [...m[1].matchAll(/"([a-z0-9_-]+)"/g)].map((x) => x[1]);

if (process.argv.includes("--update")) {
  writeFileSync(join(root, BASELINE), JSON.stringify(current, null, 2) + "\n");
  console.log(`updated ${BASELINE} (${current.length} ids)`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(join(root, BASELINE), "utf8"));
const currentSet = new Set(current);
const removed = baseline.filter((id) => !currentSet.has(id));
const baseSet = new Set(baseline);
const added = current.filter((id) => !baseSet.has(id));

if (removed.length) {
  fail(
    `sidebar config dropped item id(s): ${removed.join(", ")}. ` +
    `Items must not silently disappear (archive/hide, don't delete). If this removal is intentional and ` +
    `Jorge-approved, run \`node scripts/verify-sidebar-items-locked.mjs --update\` to re-baseline.`
  );
}
if (added.length) {
  console.log(`note: new sidebar id(s) added: ${added.join(", ")} — run with --update to re-baseline (allowed).`);
}
console.log(`PASS verify-sidebar-items-locked (${baseline.length} baseline ids all present in SIDEBAR_ITEM_IDS)`);
