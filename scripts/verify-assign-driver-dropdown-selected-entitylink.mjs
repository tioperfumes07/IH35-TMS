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

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must import/use EntityLink");
  assert(/kind=["']driver["']/.test(src), "EntityLink must be kind=driver");
  assert(
    /data-testid=["']assign-driver-selected-entitylink["']/.test(src),
    "must expose data-testid=assign-driver-selected-entitylink"
  );
  assert(/\{value \?/.test(src) || /\{value\s*\?/.test(src), "EntityLink strip must gate on selected value");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(/data-testid=["']assign-driver-selected-entitylink["']/, 'data-testid="planted-missing"');
  assert(broken !== original, "--selftest plant must mutate testid");
  fs.writeFileSync(FILE, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(FILE, original);
  }
  assert(failed, "--selftest expected FAIL when EntityLink testid removed");
  check();
  console.log(`${LABEL}: OK — selftest PASS`);
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
