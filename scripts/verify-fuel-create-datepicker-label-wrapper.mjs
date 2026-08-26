#!/usr/bin/env node
/** FUEL-F6496 — Fuel Purchase DatePicker must be outside labels and explicitly associated. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx");
function errors(source) {
  const result = [];
  const labels = [...source.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((m) => m[0]);
  if (labels.some((label) => label.includes("<DatePicker"))) result.push("Fuel DatePicker remains nested in a label");
  if (!/<label htmlFor="fuel-purchase-date">Purchase date \*<\/label>[\s\S]{0,160}<DatePicker\s+id="fuel-purchase-date"/.test(source)) result.push("Purchase date label is not associated with canonical DatePicker");
  if (!/transaction_at: transactionDate/.test(source)) result.push("canonical transaction_at payload lost selected date");
  return result;
}
function run() {
  const found = errors(fs.readFileSync(FILE, "utf8"));
  if (found.length) { console.error("verify-fuel-create-datepicker-label-wrapper FAIL:"); found.forEach((e) => console.error(" -", e)); process.exit(1); }
  console.log("verify-fuel-create-datepicker-label-wrapper OK — purchase DatePicker is outside labels, associated, and reaches payload");
}
function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  try {
    const planted = original.replace('<div className="block font-semibold text-gray-700">\n          <label htmlFor="fuel-purchase-date">Purchase date *</label>', '<label className="block font-semibold text-gray-700">\n          Purchase date *').replace('          </div>\n\n        <div className="grid gap-3 md:grid-cols-2">', '          </label>\n\n        <div className="grid gap-3 md:grid-cols-2">');
    if (planted === original) throw new Error("could not plant wrapper defect");
    fs.writeFileSync(FILE, planted);
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (red.status === 0) throw new Error("planted wrapper did not redden guard");
  } finally { fs.writeFileSync(FILE, original); }
  const orphaned = original.replace('id="fuel-purchase-date" className=', 'className=');
  if (errors(orphaned).length === 0) throw new Error("planted orphan association did not redden guard");
  console.log("verify-fuel-create-datepicker-label-wrapper --selftest PASS — wrapper and orphan defects reddened guard");
}
if (process.argv.includes("--selftest")) selftest(); else run();
