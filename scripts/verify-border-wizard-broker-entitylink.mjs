#!/usr/bin/env node
/**
 * Border Crossing Wizard Step 4 must EntityLink selected customs broker (vendor).
 *
 * FAIL: Combobox-only with no border-wizard-broker-link.
 * PASS: data-testid border-wizard-broker-link + kind=vendor.
 *
 * Self-test: node scripts/verify-border-wizard-broker-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-border-wizard-broker-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/border-crossing/WizardStep4.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/data-testid=["']border-wizard-broker-link["']/.test(src), "must expose border-wizard-broker-link");
  assert(/data-testid=["']border-wizard-step-4-entitylinks["']/.test(src), "must expose border-wizard-step-4-entitylinks");
  assert(/kind=["']vendor["']/.test(src), "must EntityLink kind=vendor");
  assert(/form\.customsBrokerId/.test(src), "must key off form.customsBrokerId");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']border-wizard-broker-link["']/,
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
  assert(failed, "--selftest expected FAIL when broker link testid removed");
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
