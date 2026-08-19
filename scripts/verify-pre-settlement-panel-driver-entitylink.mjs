#!/usr/bin/env node
/**
 * PreSettlementPanel must EntityLink the scoped driver
 * (Exact Leaves secondary.pre_settlements:driver / reverse_link).
 *
 * FAIL: panel keyed by driverId with settlement/load EntityLinks only — no driver drill.
 * PASS: data-testid=pre-settlement-panel-driver-entitylink with EntityLink kind=driver.
 *
 * Self-test: node scripts/verify-pre-settlement-panel-driver-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pre-settlement-panel-driver-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/PreSettlementPanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must use EntityLink");
  assert(
    /data-testid=["']pre-settlement-panel-driver-entitylink["']/.test(src),
    "must expose pre-settlement-panel-driver-entitylink"
  );
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']pre-settlement-panel-driver-entitylink["']/,
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
  assert(failed, "--selftest expected FAIL when driver entitylink testid removed");
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
