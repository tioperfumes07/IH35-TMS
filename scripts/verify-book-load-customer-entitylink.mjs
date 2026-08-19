#!/usr/bin/env node
/**
 * BookLoadCustomerSection must EntityLink selected customer (not picker-only).
 *
 * FAIL: no book-load-customer-link after customer_id selection.
 * PASS: data-testid book-load-customer-link + kind=customer.
 *
 * Self-test: node scripts/verify-book-load-customer-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-customer-entitylink";
const FILE = path.join(
  ROOT,
  "apps/frontend/src/pages/dispatch/components/BookLoadCustomerSection.tsx"
);

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/data-testid=["']book-load-customer-link["']/.test(src), "must expose book-load-customer-link");
  assert(
    /data-testid=["']book-load-customer-selected-entitylinks["']/.test(src),
    "must expose book-load-customer-selected-entitylinks"
  );
  assert(/kind=["']customer["']/.test(src), "must EntityLink kind=customer");
  assert(/watch\(["']customer_id["']\)/.test(src), "must key off customer_id");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']book-load-customer-link["']/,
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
  assert(failed, "--selftest expected FAIL when customer link testid removed");
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
