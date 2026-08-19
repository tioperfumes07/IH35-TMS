#!/usr/bin/env node
/**
 * BorderCrossing WizardStep1 must EntityLink selected load/unit/driver
 * (Exact Leaves dispatch.wizard.border_crossing_wizard_page:load|unit|driver).
 *
 * FAIL: EntityPicker values only — no EntityLink strip.
 * PASS: data-testid=border-wizard-step-1-entitylinks with EntityLink kinds.
 *
 * Self-test: node scripts/verify-border-crossing-wizard-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-border-crossing-wizard-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/border-crossing/WizardStep1.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must import/use EntityLink");
  assert(
    /data-testid=["']border-wizard-step-1-entitylinks["']/.test(src),
    "must expose border-wizard-step-1-entitylinks"
  );
  assert(/kind=["']load["']/.test(src), "must EntityLink kind=load");
  assert(/kind=["']unit["']/.test(src), "must EntityLink kind=unit");
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']border-wizard-step-1-entitylinks["']/,
    'data-testid="planted-missing"'
  );
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
  assert(failed, "--selftest expected FAIL when entitylinks testid removed");
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
