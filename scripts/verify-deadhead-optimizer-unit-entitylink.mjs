#!/usr/bin/env node
/**
 * DeadheadOptimizerPanel must EntityLink the scoped unit
 * (Exact Leaves dispatch.panel.deadhead_optimizer:unit).
 *
 * FAIL: unitUuid used only for the suggestions API — no unit EntityLink in panel chrome.
 * PASS: data-testid=deadhead-optimizer-unit-entitylink with EntityLink kind=unit.
 *
 * Self-test: node scripts/verify-deadhead-optimizer-unit-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-deadhead-optimizer-unit-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must use EntityLink");
  assert(
    /data-testid=["']deadhead-optimizer-unit-entitylink["']/.test(src),
    "must expose deadhead-optimizer-unit-entitylink"
  );
  assert(/kind=["']unit["']/.test(src), "must EntityLink kind=unit");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']deadhead-optimizer-unit-entitylink["']/,
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
  assert(failed, "--selftest expected FAIL when unit entitylink testid removed");
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
