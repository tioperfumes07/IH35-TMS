#!/usr/bin/env node
/**
 * SAFETY-F6468 — interactive DatePicker buttons must not be nested in labels.
 *
 * A label wrapping DatePicker re-activates its descendant trigger after calendar
 * interaction in some browsers. Safety create drawers use text spans beside the
 * canonical DatePicker instead.
 *
 * Usage:
 *   node scripts/verify-safety-datepicker-label-wrappers.mjs
 *   node scripts/verify-safety-datepicker-label-wrappers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx",
  "apps/frontend/src/components/safety/BackgroundChecksSection.tsx",
];
const EXPECTED = new Map([
  [FILES[0], [["Issued date", "medical-card-issued-date"], ["Expiry date", "medical-card-expiry-date"]]],
  [FILES[1], [["Checked date", "background-check-checked-date"], ["Expiry date (optional)", "background-check-expiry-date"]]],
]);

function inspect() {
  const errors = [];
  for (const rel of FILES) {
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    const labelBlocks = [...source.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((match) => match[0]);
    if (labelBlocks.some((block) => block.includes("<DatePicker"))) {
      errors.push(`${rel}: DatePicker remains nested in a label`);
    }
    for (const [text, id] of EXPECTED.get(rel)) {
      const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`<label htmlFor="${id}">${escaped}<\\/label><DatePicker id="${id}"(?:\\s|\/)`).test(source)) {
        errors.push(`${rel}: ${text} label must target its sibling canonical DatePicker`);
      }
    }
  }
  return errors;
}

function run() {
  const errors = inspect();
  if (errors.length) {
    console.error("verify-safety-datepicker-label-wrappers FAIL:");
    for (const error of errors) console.error(" -", error);
    process.exit(1);
  }
  console.log("verify-safety-datepicker-label-wrappers OK — 4 Safety DatePickers are outside labels");
}

function selftest() {
  const target = path.join(ROOT, FILES[0]);
  const original = fs.readFileSync(target, "utf8");
  try {
    const planted = original.replace(
      '<div className="block text-xs text-slate-600"><label htmlFor="medical-card-issued-date">Issued date</label><DatePicker',
      '<label className="block text-xs text-slate-600">Issued date<DatePicker',
    ).replace(
      'value={issuedDate} onChange={setIssuedDate} /></div>',
      'value={issuedDate} onChange={setIssuedDate} /></label>',
    );
    if (planted === original) throw new Error("could not plant wrapping-label defect");
    fs.writeFileSync(target, planted);
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (result.status === 0) throw new Error("planted wrapping-label defect did not redden guard");
  } finally {
    fs.writeFileSync(target, original);
  }
  const mismatch = original.replace('id="medical-card-expiry-date"', 'id="medical-card-expiry-date-mismatch"');
  if (mismatch === original) throw new Error("could not plant label/id mismatch");
  try {
    fs.writeFileSync(target, mismatch);
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (result.status === 0) throw new Error("planted label/id mismatch did not redden guard");
  } finally {
    fs.writeFileSync(target, original);
  }
  console.log("verify-safety-datepicker-label-wrappers --selftest PASS — 2/2 planted defects reddened guard");
}

if (process.argv.includes("--selftest")) selftest();
else run();
