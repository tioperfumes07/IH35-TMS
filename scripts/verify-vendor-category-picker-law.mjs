#!/usr/bin/env node
/** LV-VENDORS-BY-CATEGORY-PICKER-LAW — canonical picker + inline creator on By Category. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/Vendors.tsx";
const SELFTEST = process.argv.includes("--selftest");

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function problems(src) {
  const code = stripComments(src);
  const result = [];
  const block = code.match(/listStatus === "by-category"[\s\S]{0,2200}?\) : null\}/)?.[0] ?? "";
  if (!block.includes("<ReferenceSelect")) result.push("By Category is not using ReferenceSelect");
  if (!block.includes('createKind="vendor_type"')) result.push("missing canonical vendor_type creator");
  if (!block.includes('addNewLabel="+ Add new vendor type"')) result.push("missing first-row + Add new label");
  if (!code.includes('catalogName: "vendors.vendor_types"')) result.push("missing company-scoped canonical catalog read");
  if (!code.includes("label && value && !knownLabels.has(label.toLocaleLowerCase())")) result.push("missing duplicate catalog-label dedupe");
  if (!code.includes("knownLabels.has(value.toLocaleLowerCase())")) result.push("missing case-insensitive catalog/legacy label dedupe");
  if (/<select[\s\S]{0,500}?id="vendor-category-filter"/.test(block)) result.push("bare select regressed");
  return result;
}

const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
if (SELFTEST) {
  const planted = live
    .replace("<ReferenceSelect", "<select")
    .replace('createKind="vendor_type"', "")
    .replace('addNewLabel="+ Add new vendor type"', "")
    .replace("label && value && !knownLabels.has(label.toLocaleLowerCase())", "label && value")
    .replace("knownLabels.has(value.toLocaleLowerCase())", "false");
  if (!problems(planted).length) {
    console.error("verify-vendor-category-picker-law SELFTEST FAILED: planted defect not caught");
    process.exit(1);
  }
  if (problems(live).length) {
    console.error(`verify-vendor-category-picker-law SELFTEST FAILED live: ${problems(live).join(" | ")}`);
    process.exit(1);
  }
  console.log("verify-vendor-category-picker-law SELFTEST PASS");
  process.exit(0);
}

const failures = problems(live);
if (failures.length) {
  console.error(`verify-vendor-category-picker-law FAILED: ${failures.join(" | ")}`);
  process.exit(1);
}
console.log("verify-vendor-category-picker-law OK");
