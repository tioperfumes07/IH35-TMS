#!/usr/bin/env node
/**
 * SaveLoadTemplateModal must EntityLink source load + customer
 * (Exact Leaves dispatch.modal.save_load_template:load|customer|reverse_link).
 *
 * FAIL: name-only modal with no EntityLinks to the source load/customer.
 * PASS: data-testid=save-load-template-modal-entitylinks + LoadDetailDrawer props.
 *
 * Self-test: node scripts/verify-save-load-template-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-save-load-template-modal-entitylinks";
const MODAL = path.join(ROOT, "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const modal = fs.readFileSync(MODAL, "utf8");
  const drawer = fs.readFileSync(DRAWER, "utf8");
  assert(/EntityLink/.test(modal), "modal must use EntityLink");
  assert(
    /data-testid=["']save-load-template-modal-entitylinks["']/.test(modal),
    "must expose save-load-template-modal-entitylinks"
  );
  assert(/kind=["']load["']/.test(modal), "must EntityLink kind=load");
  assert(/kind=["']customer["']/.test(modal), "must EntityLink kind=customer");
  assert(/loadId=\{load\.id\}/.test(drawer), "LoadDetailDrawer must pass loadId");
  assert(/customerId=\{load\.customer_id\}/.test(drawer), "LoadDetailDrawer must pass customerId");
}

function selftest() {
  const original = fs.readFileSync(MODAL, "utf8");
  const broken = original.replace(
    /data-testid=["']save-load-template-modal-entitylinks["']/,
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
