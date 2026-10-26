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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/frontend/src/components/safety/MedicalCardsHistorySection.tsx",
  "apps/frontend/src/components/safety/BackgroundChecksSection.tsx",
];
const EXPECTED = new Map([
  [FILES[0], [["Issued date", "medical-card-issued-date"], ["Expiry date", "medical-card-expiry-date"]]],
  [FILES[1], [["Checked date", "background-check-checked-date"], ["Expiry date (optional)", "background-check-expiry-date"]]],
]);

function inspect(read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8")) {
  const errors = [];
  for (const rel of FILES) {
    const source = read(rel);
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

/** In-memory plants (never writes tracked source): wrap the FIRST real <DatePicker …/> in a <label>, and duplicate one. */
function wrapFirstDatePicker(src) {
  const at = src.indexOf("<DatePicker");
  const end = at < 0 ? -1 : src.indexOf("/>", at);
  return at < 0 || end < 0 ? src : `${src.slice(0, at)}<label>${src.slice(at, end + 2)}</label>${src.slice(end + 2)}`;
}
function duplicateFirstDatePicker(src) {
  const at = src.indexOf("<DatePicker");
  const end = at < 0 ? -1 : src.indexOf("/>", at);
  return at < 0 || end < 0 ? src : `${src.slice(0, end + 2)}${src.slice(at, end + 2)}${src.slice(end + 2)}`;
}
function selftest() {
  // In-memory plants on the real sources (the old selftest wrote the tracked file, and its slate-600 wrapper
  // literal stopped matching after the owner palette sweep, so the wrap plant became a no-op).
  const real = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (inspect(real).length) { console.error("verify-safety-datepicker-label-wrappers --selftest FAIL — real sources rejected"); process.exit(1); }
  const rel = FILES[0];
  const plants = [
    ["DatePicker wrapped in a label", wrapFirstDatePicker],
    ["label/id mismatch", (src) => src.replace('id="medical-card-expiry-date"', 'id="medical-card-expiry-date-mismatch"')],
  ];
  for (const [name, plant] of plants) {
    const planted = plant(real(rel));
    if (planted === real(rel)) { console.error(`verify-safety-datepicker-label-wrappers --selftest FAIL — could not plant: ${name}`); process.exit(1); }
    if (inspect((r) => (r === rel ? planted : real(r))).length === 0) { console.error(`verify-safety-datepicker-label-wrappers --selftest FAIL — escaped: ${name}`); process.exit(1); }
  }
  console.log(`verify-safety-datepicker-label-wrappers --selftest PASS — ${plants.length}/${plants.length} in-memory plants reddened the guard`);
}
if (process.argv.includes("--selftest")) selftest();
else run();
