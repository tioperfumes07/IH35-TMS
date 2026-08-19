#!/usr/bin/env node
/**
 * OptimalDriversPanel ranked rows must EntityLink each driver
 * (Exact Leaves dispatch.panel.optimal_drivers:driver).
 *
 * FAIL: plain display_name text only.
 * PASS: EntityLink kind=driver + data-testid optimal-driver-entitylink-*.
 *
 * Self-test: node scripts/verify-optimal-drivers-panel-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-optimal-drivers-panel-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/OptimalDriversPanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must import/use EntityLink");
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
  assert(
    /data-testid=\{`optimal-driver-entitylink-\$\{d\.rank\}`\}/.test(src) ||
      /optimal-driver-entitylink-/.test(src),
    "must expose optimal-driver-entitylink-* testids"
  );
  assert(/stopPropagation/.test(src), "EntityLink click must stopPropagation so select still works");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(/kind=["']driver["']/, 'kind="planted"');
  assert(broken !== original, "--selftest plant must mutate kind");
  fs.writeFileSync(FILE, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(FILE, original);
  }
  assert(failed, "--selftest expected FAIL when driver kind removed");
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
