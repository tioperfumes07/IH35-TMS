#!/usr/bin/env node
/** DRIVER-F6493 — hand-authored CreateDriver labels target their real controls. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";
const diskSource = fs.readFileSync(path.join(ROOT, REL), "utf8");
const ids = [
  "operating_company_id", "cdl_state", "country_code", "phone_input", "cdl_class",
  "status", "pay_basis", "mx_state", "emergency_contact_address", "emergency_contact_notes",
];

function assertContract(source) {
  for (const id of ids) {
    const association = new RegExp(`htmlFor="${id}"[\\s\\S]{0,1800}<(?:Combobox|SelectCombobox|input|textarea)[\\s\\S]{0,240}id="${id}"`);
    if (!association.test(source)) {
      throw new Error(`orphaned CreateDriver label/control ${id}`);
    }
  }
  for (const token of [
    "operating_company_id: nextValue ?? \"\"",
    "cdl_state: nextValue ?? \"\"",
    "country_code: event.target.value",
    "phone_input: event.target.value",
    "cdl_class: nextValue ?? \"\"",
    "status: nextValue ?? \"\"",
    "pay_basis: nextValue ?? \"\"",
    "mx_state: nextValue ?? \"\"",
    "emergency_contact_address: event.target.value",
    "emergency_contact_notes: event.target.value",
  ]) if (!source.includes(token)) throw new Error(`CreateDriver payload path missing: ${token}`);
}

if (process.argv.includes("--selftest")) {
  const planted = diskSource.replace('id="operating_company_id"', 'id="wrong_company_id"');
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    cwd: ROOT,
    env: { ...process.env, DRIVER_F6493_PLANTED_SOURCE: planted },
    encoding: "utf8",
  });
  if (child.status === 0) throw new Error("selftest failed: planted orphaned Operating Company label stayed green");
  console.log("verify-create-driver-handwritten-label-association --selftest PASS");
  process.exit(0);
}

assertContract(process.env.DRIVER_F6493_PLANTED_SOURCE ?? diskSource);
console.log(`verify-create-driver-handwritten-label-association PASS — ${ids.length} labels associated and payload paths preserved`);
