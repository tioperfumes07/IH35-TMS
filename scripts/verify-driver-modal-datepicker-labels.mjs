#!/usr/bin/env node
/** DRIVER-F6472 — Drivers modal DatePicker labels target their trigger buttons. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED = {
  "apps/frontend/src/components/drivers/W8BenModal.tsx": ["w8ben-dob", "w8ben-signed"],
  "apps/frontend/src/components/drivers/AddTrainingModal.tsx": ["add-training-completed", "add-training-expiry"],
  "apps/frontend/src/components/drivers/TerminateConfirmModal.tsx": ["terminate-event-date"],
};
function errors(overrides = new Map()) {
  const out = [];
  for (const [rel, ids] of Object.entries(EXPECTED)) {
    const source = overrides.has(rel)
      ? overrides.get(rel)
      : fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const id of ids) {
      if (!source.includes(`htmlFor="${id}"`)) out.push(`${rel}: label missing htmlFor=${id}`);
      if (!new RegExp(`<DatePicker[\\s\\S]{0,160}id="${id}"`).test(source)) out.push(`${rel}: DatePicker missing id=${id}`);
    }
  }
  return out;
}
function run() { const found = errors(); if (found.length) { console.error("verify-driver-modal-datepicker-labels FAIL:"); found.forEach((e) => console.error(" -", e)); process.exit(1); } console.log("verify-driver-modal-datepicker-labels OK — 5 modal calendar labels target their buttons"); }
function selftest() {
  const rel = Object.keys(EXPECTED)[0]; const original = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const planted = original.replace('htmlFor="w8ben-dob"', 'data-orphaned="w8ben-dob"');
  if (planted === original) throw new Error("could not plant orphaned label");
  const red = errors(new Map([[rel, planted]]));
  if (!red.some((message) => message.includes("label missing htmlFor=w8ben-dob"))) throw new Error("orphaned label did not redden");
  console.log("verify-driver-modal-datepicker-labels --selftest PASS — orphaned label reddened guard");
}
if (process.argv.includes("--selftest")) selftest(); else run();
