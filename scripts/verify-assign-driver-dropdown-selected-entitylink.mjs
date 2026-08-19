#!/usr/bin/env node
/**
 * AssignDriverDropdown must expose a real driver EntityLink when a driver is selected
 * (Exact Leaves: dispatch.modal.load_reassign:driver / assign_driver_dropdown:driver).
 *
 * FAIL: Combobox-only labels with no EntityLink for the selected driver.
 * PASS: EntityLink kind=driver + data-testid assign-driver-selected-entitylink when value set.
 *
 * Self-test: node scripts/verify-assign-driver-dropdown-selected-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-assign-driver-dropdown-selected-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkSource(src) {
  assert(/import\s*\{\s*EntityLinkOrTombstone\s*\}\s*from\s*["'][^"']*\/EntityLinkOrTombstone["']/.test(src), "must import canonical label-aware tombstones");
  assert(/kind="driver"[\s\S]{0,80}id=\{value\}[\s\S]{0,220}name=\{optionsRows\.find\(\(d\) => d\.driver_id === value\)\?\.display_name \?\? createdOption\?\.display_name \?\? null\}[\s\S]{0,60}noun="Driver"/.test(src), "selected driver must couple canonical id to its resolved human name");
  assert(
    /data-testid=["']assign-driver-selected-entitylink["']/.test(src),
    "must expose data-testid=assign-driver-selected-entitylink"
  );
  assert(/\{value \?/.test(src) || /\{value\s*\?/.test(src), "EntityLink strip must gate on selected value");
}

function check() { checkSource(fs.readFileSync(FILE, "utf8")); }

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const mutations = [
    [/data-testid=["']assign-driver-selected-entitylink["']/, 'data-testid="planted-missing"'],
    [/name=\{optionsRows\.find\(\(d\) => d\.driver_id === value\)\?\.display_name \?\? createdOption\?\.display_name \?\? null\}/, "name={value}"],
    [/EntityLinkOrTombstone/, "EntityLink"],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = original.replace(pattern, replacement);
    assert(broken !== original, `--selftest plant must mutate ${pattern}`);
    let failed = false;
    try { checkSource(broken); } catch { failed = true; }
    assert(failed, `--selftest expected FAIL for ${pattern}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS (${mutations.length} mutations)`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
