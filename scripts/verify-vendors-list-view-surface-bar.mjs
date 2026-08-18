#!/usr/bin/env node
/**
 * verify-vendors-list-view-surface-bar — LV-VENDORS-LIST-TOOLBAR-RANGE-GEAR-MISSING ratchet
 *
 * Required leaves chrome.toolbar_range / chrome.toolbar_gear name VendorsListView.tsx.
 * That surface must keep ParityTable (UniversalListToolbar Range + Table settings gear).
 * Master-detail sidebar is a distinct contract — do not "fix" by duplicating chrome there.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SELF = path.join(ROOT, "scripts/verify-vendors-list-view-surface-bar.mjs");
const LIST = path.join(ROOT, "apps/frontend/src/pages/vendors/VendorsListView.tsx");
const PARITY = path.join(ROOT, "apps/frontend/src/components/parity/ParityTable.tsx");

function fail(msg) {
  console.error(`FAIL verify-vendors-list-view-surface-bar: ${msg}`);
  process.exit(1);
}

function assertSource() {
  if (!fs.existsSync(LIST)) fail("missing VendorsListView.tsx");
  if (!fs.existsSync(PARITY)) fail("missing ParityTable.tsx");
  const list = fs.readFileSync(LIST, "utf8");
  const parity = fs.readFileSync(PARITY, "utf8");
  if (!/from \"\.\.\/\.\.\/components\/parity\/ParityTable\"/.test(list) && !/ParityTable/.test(list)) {
    fail("VendorsListView must use ParityTable");
  }
  if (!/<ParityTable[\s\S]*storageKey=\"vendors-list\"/.test(list)) {
    fail("VendorsListView must mount ParityTable with storageKey vendors-list");
  }
  if (!/UniversalListToolbar/.test(parity)) {
    fail("ParityTable must wire UniversalListToolbar (Range + Search)");
  }
  if (!/aria-label=\"Table settings\"/.test(parity)) {
    fail("ParityTable must expose Table settings gear");
  }
  if (!/onRangeApply/.test(parity)) {
    fail("ParityTable must expose Range Apply");
  }
}

function selftest() {
  assertSource();
  const backup = fs.readFileSync(LIST, "utf8");
  try {
    const planted = backup.replace(/<ParityTable[\s\S]*?\/>/, "<div data-broken-vendors-list />");
    if (planted === backup) {
      // multiline self-closing may not match — strip ParityTable import usage instead
      const planted2 = backup.replace("ParityTable", "BrokenTable").replace("<BrokenTable", "<div").replace("BrokenTable<", "div");
      fs.writeFileSync(LIST, planted2.includes("BrokenTable") ? planted2 : backup.replace(/ParityTable/g, "XParityTable"));
    } else {
      fs.writeFileSync(LIST, planted);
    }
    const r = spawnSync(process.execPath, [SELF], { encoding: "utf8" });
    if (r.status === 0) fail("mutated VendorsListView still passed");
  } finally {
    fs.writeFileSync(LIST, backup);
  }
  console.log("PASS: verify-vendors-list-view-surface-bar --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else {
  assertSource();
  console.log("PASS: verify-vendors-list-view-surface-bar");
}
