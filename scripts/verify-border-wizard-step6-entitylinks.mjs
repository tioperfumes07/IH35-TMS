#!/usr/bin/env node
/**
 * Border Crossing Wizard Step 6 review must EntityLink load/unit/driver/broker.
 *
 * FAIL: review dl without border-wizard-step-6-entitylinks.
 * PASS: load/unit/driver/broker testids present.
 *
 * Self-test: node scripts/verify-border-wizard-step6-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-border-wizard-step6-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/border-crossing/WizardStep6.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/data-testid=["']border-wizard-step-6-entitylinks["']/.test(src), "must expose border-wizard-step-6-entitylinks");
  assert(/data-testid=["']border-wizard-step6-load-link["']/.test(src), "must expose load link");
  assert(/data-testid=["']border-wizard-step6-unit-link["']/.test(src), "must expose unit link");
  assert(/data-testid=["']border-wizard-step6-driver-link["']/.test(src), "must expose driver link");
  assert(/data-testid=["']border-wizard-step6-broker-link["']/.test(src), "must expose broker link");
  assert(/kind=["']load["']/.test(src) && /kind=["']vendor["']/.test(src), "must EntityLink load + vendor");
  for (const entity of ["load", "unit", "driver"]) {
    assert(new RegExp(`entityLabel\\(form\\.${entity}Label, form\\.${entity}Id, "`).test(src), `${entity} review link must use its retained human label`);
  }
  assert(/entityLabel\(form\.customsBrokerLabel, form\.customsBrokerId, "Vendor"\)/.test(src), "broker review link must use its retained human label");
  assert(!/entityLabel\(null, form\.(loadId|unitId|driverId|customsBrokerId)/.test(src), "review must not rebuild labels from UUIDs");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /entityLabel\(form\.loadLabel, form\.loadId, "Load"\)/,
    'entityLabel(null, form.loadId, "Load")'
  );
  assert(broken !== original, "--selftest plant must restore UUID-only load label");
  fs.writeFileSync(FILE, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(FILE, original);
  }
  assert(failed, "--selftest expected FAIL when strip testid removed");
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
