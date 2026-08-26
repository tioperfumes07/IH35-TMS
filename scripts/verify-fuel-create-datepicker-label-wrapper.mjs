#!/usr/bin/env node
/** FUEL-F6471 — Fuel Purchase DatePicker must not be nested in a wrapping label. */
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
  if (!/<span>Purchase date \*<\/span>[\s\S]{0,120}<DatePicker\b/.test(source)) result.push("Purchase date field group lost canonical DatePicker");
  if (!/transaction_at: transactionDate/.test(source)) result.push("canonical transaction_at payload lost selected date");
  return result;
}
function run() {
  const found = errors(fs.readFileSync(FILE, "utf8"));
  if (found.length) { console.error("verify-fuel-create-datepicker-label-wrapper FAIL:"); found.forEach((e) => console.error(" -", e)); process.exit(1); }
  console.log("verify-fuel-create-datepicker-label-wrapper OK — purchase DatePicker is outside labels and reaches payload");
}
function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  try {
    const planted = original.replace('<div className="block font-semibold text-gray-700">\n          <span>Purchase date *</span>', '<label className="block font-semibold text-gray-700">\n          Purchase date *').replace('          </div>\n\n        <div className="grid gap-3 md:grid-cols-2">', '          </label>\n\n        <div className="grid gap-3 md:grid-cols-2">');
    if (planted === original) throw new Error("could not plant wrapper defect");
    fs.writeFileSync(FILE, planted);
    const red = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], { cwd: ROOT, encoding: "utf8" });
    if (red.status === 0) throw new Error("planted wrapper did not redden guard");
  } finally { fs.writeFileSync(FILE, original); }
  console.log("verify-fuel-create-datepicker-label-wrapper --selftest PASS — planted defect reddened guard");
}
if (process.argv.includes("--selftest")) selftest(); else run();
