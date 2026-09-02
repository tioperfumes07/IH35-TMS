#!/usr/bin/env node
/**
 * BookLoadModalV4 edit header must EntityLink the load (not plain entityLabel).
 *
 * FAIL: Edit load ${entityLabel(...)} plain text.
 * PASS: data-testid book-load-edit-header-load-link.
 *
 * Self-test: node scripts/verify-book-load-edit-header-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-book-load-edit-header-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function headerBody(src) {
  const start = src.indexOf('Dispatch › Edit load');
  assert(start >= 0, "must have Edit load breadcrumb");
  return src.slice(start, start + 1200);
}

function check(source = fs.readFileSync(FILE, "utf8")) {
  const body = headerBody(source);
  assert(/data-testid=["']book-load-edit-header-load-link["']/.test(body), "must expose book-load-edit-header-load-link");
  assert(/kind=["']load["']/.test(body), "must EntityLink kind=load");
  assert(!/Edit load\{editLoad\?\.load_number \? ` \$\{entityLabel/.test(body), "must not interpolate plain entityLabel into Edit load title");
  assert(/>Book load</.test(source), "must keep Book load literal for locked-ui-surface");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']book-load-edit-header-load-link["']/,
    'data-testid="planted-missing"'
  );
  assert(broken !== original, "--selftest plant must mutate testid");
  let failed = false;
  try {
    check(broken);
  } catch {
    failed = true;
  }
  assert(failed, "--selftest expected FAIL when load link testid removed");
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
