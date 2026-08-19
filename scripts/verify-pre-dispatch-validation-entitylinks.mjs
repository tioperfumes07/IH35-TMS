#!/usr/bin/env node
/**
 * PreDispatchValidationPanel must expose EntityLinks for selected driver/unit/trailer/customer
 * (Exact Leaves dispatch.panel.pre_dispatch_validation:unit|trailer|customer).
 *
 * FAIL: UUID query params only — no EntityLink strip.
 * PASS: data-testid=pre-dispatch-validation-entitylinks with EntityLink kinds.
 *
 * Self-test: node scripts/verify-pre-dispatch-validation-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pre-dispatch-validation-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must import/use EntityLink");
  assert(
    /data-testid=["']pre-dispatch-validation-entitylinks["']/.test(src),
    "must expose pre-dispatch-validation-entitylinks"
  );
  assert(/kind=["']driver["']/.test(src), "must EntityLink kind=driver");
  assert(/kind=["']unit["']/.test(src), "must EntityLink kind=unit");
  assert(/kind=["']trailer["']/.test(src), "must EntityLink kind=trailer");
  assert(/kind=["']customer["']/.test(src), "must EntityLink kind=customer");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']pre-dispatch-validation-entitylinks["']/,
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
