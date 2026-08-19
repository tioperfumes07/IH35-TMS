#!/usr/bin/env node
/**
 * AbandonmentReportModal must EntityLink source load + selected driver
 * (Exact Leaves dispatch.modal.abandonment_report:load|driver).
 *
 * FAIL: loadId API-only / driver picker-only — no EntityLink strip.
 * PASS: data-testid=abandonment-report-modal-entitylinks; drawer passes loadNumber.
 *
 * Self-test: node scripts/verify-abandonment-report-modal-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-abandonment-report-modal-entitylinks";
const MODAL = path.join(ROOT, "apps/frontend/src/pages/loads/AbandonmentReportModal.tsx");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function check() {
  const modal = fs.readFileSync(MODAL, "utf8");
  const drawer = fs.readFileSync(DRAWER, "utf8");
  assert(/EntityLink/.test(modal), "must import/use EntityLink");
  assert(
    /data-testid=["']abandonment-report-modal-entitylinks["']/.test(modal),
    "must expose abandonment-report-modal-entitylinks"
  );
  assert(/kind=["']load["']/.test(modal), "must EntityLink kind=load");
  assert(/kind=["']driver["']/.test(modal), "must EntityLink kind=driver");
  assert(/loadNumber=\{load\.load_number\}/.test(drawer), "LoadDetailDrawer must pass loadNumber");
}

function selftest() {
  const original = fs.readFileSync(MODAL, "utf8");
  const broken = original.replace(
    /data-testid=["']abandonment-report-modal-entitylinks["']/,
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
