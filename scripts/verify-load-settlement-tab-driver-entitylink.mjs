#!/usr/bin/env node
/**
 * LoadDetailSettlementTab must expose a driver EntityLinkOrTombstone with testid
 * (Exact Leaves load.drawer.settlement:driver).
 *
 * FAIL: driver EntityLink present without a stable data-testid for Live Exact Leaves.
 * PASS: data-testid=load-settlement-tab-driver-entitylink + kind=driver EntityLinkOrTombstone.
 *
 * Self-test: node scripts/verify-load-settlement-tab-driver-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-settlement-tab-driver-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailSettlementTab.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLinkOrTombstone/.test(src), "must use EntityLinkOrTombstone");
  assert(
    /data-testid=["']load-settlement-tab-driver-entitylink["']/.test(src),
    "must expose load-settlement-tab-driver-entitylink"
  );
  assert(/kind=["']driver["']/.test(src), "must EntityLinkOrTombstone kind=driver");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']load-settlement-tab-driver-entitylink["']/,
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
