#!/usr/bin/env node
/**
 * LoadReassignModal must EntityLink the load being reassigned
 * (Exact Leaves dispatch.modal.load_reassign:load).
 *
 * FAIL: title uses loadNumber plain text only.
 * PASS: data-testid=load-reassign-modal-load-entitylink with EntityLink kind=load.
 *
 * Self-test: node scripts/verify-load-reassign-modal-load-entitylink.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-reassign-modal-load-entitylink";
const FILE = path.join(ROOT, "apps/frontend/src/pages/dispatch/LoadReassignModal.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const src = fs.readFileSync(FILE, "utf8");
  assert(/EntityLink/.test(src), "must import/use EntityLink");
  assert(
    /data-testid=["']load-reassign-modal-load-entitylink["']/.test(src),
    "must expose load-reassign-modal-load-entitylink"
  );
  assert(/kind=["']load["']/.test(src), "must EntityLink kind=load");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const broken = original.replace(
    /data-testid=["']load-reassign-modal-load-entitylink["']/,
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
  assert(failed, "--selftest expected FAIL when entitylink testid removed");
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
