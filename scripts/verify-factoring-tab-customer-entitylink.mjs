#!/usr/bin/env node
/**
 * FactoringTab must EntityLink the load's customer
 * (Exact Leaves load.drawer.factoring:customer).
 *
 * FAIL: customer_id used only for invoice queries — no customer EntityLink in tab body.
 * PASS: data-testid=factoring-tab-customer-entitylink with EntityLink kind=customer.
 *
 * Self-test: node scripts/verify-factoring-tab-customer-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-tab-customer-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must use EntityLink");
  assert(
    /data-testid=["']factoring-tab-customer-entitylink["']/.test(src),
    "must expose factoring-tab-customer-entitylink"
  );
  assert(/kind=["']customer["']/.test(src), "must EntityLink kind=customer");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']factoring-tab-customer-entitylink["']/,
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
  assert(failed, "--selftest expected FAIL when customer entitylink testid removed");
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
