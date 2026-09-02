#!/usr/bin/env node
/** FLEET-F6469 — canonical trailer create uses product Combobox chrome for Type. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/frontend/src/components/fleet/CreateTrailerModal.tsx");

function failures(source) {
  const errors = [];
  if (/<select\b[^>]*data-testid="fleet-create-trailer-type"/.test(source)) errors.push("Type regressed to native select");
  const control = source.match(/<FormField label="Type"[\s\S]*?<\/FormField>/)?.[0] ?? "";
  for (const token of ["<Combobox", 'id="equipment_type"', 'dataTestId="fleet-create-trailer-type"', 'dataField="equipment_type"', "options={allowedTypes.map", "set(\"equipment_type\""]) {
    if (!control.includes(token)) errors.push(`Type Combobox missing ${token}`);
  }
  if (!source.includes('equipment_type: input.draft.equipment_type')) errors.push("canonical submitted create payload lost equipment_type");
  return errors;
}

function run() {
  const errors = failures(fs.readFileSync(FILE, "utf8"));
  if (errors.length) {
    console.error("verify-fleet-create-trailer-type-combobox FAIL:");
    for (const error of errors) console.error(" -", error);
    process.exit(1);
  }
  console.log("verify-fleet-create-trailer-type-combobox OK — Type uses canonical Combobox and payload");
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const planted = original.replace('dataTestId="fleet-create-trailer-type"', 'data-testid="fleet-create-trailer-type"').replace("<Combobox", "<select");
  if (planted === original) throw new Error("could not plant native-select defect");
  const plantedFailures = failures(planted);
  if (!plantedFailures.some((message) => message.includes("native select"))) {
    throw new Error("planted native-select defect did not redden guard");
  }
  console.log("verify-fleet-create-trailer-type-combobox --selftest PASS — planted defect reddened guard");
}

if (process.argv.includes("--selftest")) selftest();
else run();
