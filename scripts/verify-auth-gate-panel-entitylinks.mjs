#!/usr/bin/env node
/**
 * AuthGatePanel must expose EntityLinks for bound load/driver/unit/trailer
 * (Exact Leaves dispatch.panel.auth_gate:driver|unit|trailer|load reverse/forward).
 *
 * FAIL: UUID query params only — no EntityLink strip.
 * PASS: data-testid=auth-gate-panel-entitylinks with EntityLink kinds.
 *
 * Self-test: node scripts/verify-auth-gate-panel-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-auth-gate-panel-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/AuthGatePanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must import/use EntityLink");
  assert(
    /data-testid=["']auth-gate-panel-entitylinks["']/.test(src),
    "must expose auth-gate-panel-entitylinks"
  );
  assert(/kind=["']load["']/.test(src), "must EntityLink kind=load");
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
  assert(/kind=["']unit["']/.test(src), "must EntityLink kind=unit");
  assert(/kind=["']trailer["']/.test(src), "must EntityLink kind=trailer");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']auth-gate-panel-entitylinks["']/,
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
