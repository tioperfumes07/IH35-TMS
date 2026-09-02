#!/usr/bin/env node
/**
 * Assignment History Driver EntityPicker must obey universal picker law (V2):
 * allowCreate ON so + Add new / Create Driver is the first row.
 *
 * FAIL: allowCreate={false} on the Driver filter (AUDIT secondary.assignments:picker_law unpaid).
 * PASS: Driver EntityPicker offers create (allowCreate / default true — not false).
 *
 * Self-test: node scripts/verify-assignment-history-driver-picker-law.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-assignment-history-driver-picker-law";
const PAGE = path.join(ROOT, "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check(src = fs.readFileSync(PAGE, "utf8")) {
  assert(/EntityPicker/.test(src), "AssignmentHistoryPage must use EntityPicker");
  assert(/kind=["']driver["']/.test(src), "must have Driver EntityPicker");
  // Isolate the Driver EntityPicker JSX block (kind=driver … closing />)
  const m = src.match(/<EntityPicker[\s\S]*?kind=["']driver["'][\s\S]*?\/>/);
  assert(m, "could not isolate Driver EntityPicker JSX");
  const block = m[0];
  assert(
    !/allowCreate=\{false\}/.test(block),
    "Driver EntityPicker must not set allowCreate={false} (picker_law)"
  );
  assert(
    /allowCreate(?:\s|=|>|\/)/.test(block) || !/allowCreate/.test(block),
    "Driver EntityPicker must allow create (explicit allowCreate or default true)"
  );
}

function selftest() {
  const original = fs.readFileSync(PAGE, "utf8");
  const broken = original.replace(
    /(<EntityPicker[\s\S]*?kind=["']driver["'][\s\S]*?)allowCreate(\s|\n)/,
    "$1allowCreate={false}$2"
  );
  // If allowCreate prop missing, inject false
  let planted = broken;
  if (broken === original) {
    planted = original.replace(
      /(<EntityPicker[\s\S]*?kind=["']driver["'][\s\S]*?)(\/>)/,
      "$1allowCreate={false}\n          $2"
    );
  }
  assert(planted !== original, "--selftest plant must mutate allowCreate");
  let failed = false;
  try {
    check(planted);
  } catch {
    failed = true;
  }
  assert(failed, "--selftest expected FAIL when allowCreate={false}");
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
