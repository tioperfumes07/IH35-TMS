#!/usr/bin/env node
/**
 * QuickAssignModal must EntityLink load + selected driver/unit/trailer
 * (Exact Leaves dispatch.modal.quick_assign:load|driver|unit|trailer).
 *
 * FAIL: pickers/title only — no EntityLink strip / no loadId prop.
 * PASS: load EntityLink + data-testid=quick-assign-modal-entitylinks; DispatchBoard passes loadId.
 *
 * Self-test: node scripts/verify-quick-assign-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-quick-assign-modal-entitylinks";
const MODAL = path.join(ROOT, "apps/frontend/src/pages/dispatch/components/QuickAssignModal.tsx");
const BOARD = path.join(ROOT, "apps/frontend/src/pages/dispatch/DispatchBoard.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const modal = fs.readFileSync(MODAL, "utf8");
  const board = fs.readFileSync(BOARD, "utf8");
  assert(/EntityLink/.test(modal), "modal must use EntityLink");
  assert(/data-testid=["']quick-assign-load-entitylink["']/.test(modal), "must link load");
  assert(
    /data-testid=["']quick-assign-modal-entitylinks["']/.test(modal),
    "must expose quick-assign-modal-entitylinks"
  );
  assert(/kind=["']driver["']/.test(modal), "must EntityLink kind=driver");
  assert(/kind=["']unit["']/.test(modal), "must EntityLink kind=unit");
  assert(/kind=["']trailer["']/.test(modal), "must EntityLink kind=trailer");
  assert(/loadId=\{quickAssignLoad\.id\}/.test(board), "DispatchBoard must pass loadId");
}

function selftest() {
  const original = fs.readFileSync(MODAL, "utf8");
  const broken = original.replace(
    /data-testid=["']quick-assign-modal-entitylinks["']/,
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
