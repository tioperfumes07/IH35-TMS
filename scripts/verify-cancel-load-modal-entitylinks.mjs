#!/usr/bin/env node
/**
 * CancelLoadModal must EntityLink the source load when loadId is passed
 * (Exact Leaves dispatch.modal.cancel_load:load|reverse_link).
 *
 * FAIL: Cancel Load chrome with no EntityLink to the load being cancelled.
 * PASS: data-testid=cancel-load-modal-entitylinks; LoadDetailDrawer passes loadId.
 *
 * Self-test: node scripts/verify-cancel-load-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cancel-load-modal-entitylinks";
const MODAL = path.join(ROOT, "apps/frontend/src/components/dispatch/CancelLoadModal.tsx");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const modal = fs.readFileSync(MODAL, "utf8");
  const drawer = fs.readFileSync(DRAWER, "utf8");
  assert(/EntityLink/.test(modal), "modal must use EntityLink");
  assert(
    /data-testid=["']cancel-load-modal-entitylinks["']/.test(modal),
    "must expose cancel-load-modal-entitylinks"
  );
  assert(/kind=["']load["']/.test(modal), "must EntityLink kind=load");
  assert(/loadId=\{load\.id\}/.test(drawer), "LoadDetailDrawer must pass loadId to CancelLoadModal");
}

function selftest() {
  const original = fs.readFileSync(MODAL, "utf8");
  const broken = original.replace(
    /data-testid=["']cancel-load-modal-entitylinks["']/,
    'data-testid="planted-missing"'
  );
  assert(broken !== original, "--selftest plant must mutate testid");
  fs.writeFileSync(MODAL, broken);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  } finally {
    fs.writeFileSync(MODAL, original);
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
