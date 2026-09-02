#!/usr/bin/env node
/**
 * LV-DRIVER-DOB-SILENTLY-DROPPED ratchet — CreateDriverModal must:
 *  1) expose DatePicker/input for date_of_birth, mexican_license_*, passport_country
 *  2) include those keys in zod schema + initial form + mutateAsync submit payload
 *  3) CreateDriverInput type carries the same keys
 *  4) backend create schema already accepts them (belt-and-suspenders)
 *
 * --selftest strips date_of_birth from the submit payload and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODAL = path.join(ROOT, "apps/frontend/src/components/drivers/CreateDriverModal.tsx");
const TYPES = path.join(ROOT, "apps/frontend/src/types/api.ts");
const ROUTES = path.join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");

const REQUIRED = [
  "date_of_birth",
  "mexican_license_number",
  "mexican_license_expiration",
  "passport_country",
];

function assertWired(label, src, re) {
  if (!re.test(src)) throw new Error(`${label}: missing ${re}`);
}

function checkSources({ modal, types, routes }) {
  const errors = [];
  for (const key of REQUIRED) {
    try {
      assertWired(`CreateDriverModal schema:${key}`, modal, new RegExp(`${key}:\\s*z(?:\\.|\\s)`));
      assertWired(`CreateDriverModal initial:${key}`, modal, new RegExp(`${key}:\\s*""`));
      assertWired(`CreateDriverModal submit:${key}`, modal, new RegExp(`${key}:\\s*parsed\\.${key}`));
      assertWired(`CreateDriverModal UI:${key}`, modal, new RegExp(`\\["${key}"`));
      assertWired(`CreateDriverInput:${key}`, types, new RegExp(`${key}\\?:\\s*string`));
      assertWired(`drivers.routes create:${key}`, routes, new RegExp(`${key}:`));
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  try {
    assertWired("CreateDriverModal Date of birth label", modal, /Date of birth/);
    assertWired("CreateDriverModal Mexican license label", modal, /Mexican license #/);
  } catch (e) {
    errors.push(String(e.message || e));
  }
  return errors;
}

function readAll() {
  return {
    modal: fs.readFileSync(MODAL, "utf8"),
    types: fs.readFileSync(TYPES, "utf8"),
    routes: fs.readFileSync(ROUTES, "utf8"),
  };
}

function selftest() {
  const original = readAll();
  const broken = original.modal.replace(/date_of_birth:\s*parsed\.date_of_birth \|\| undefined,\n/, "");
  if (broken === original.modal) throw new Error("selftest: could not plant defect (date_of_birth submit missing)");
  const errors = checkSources({ ...original, modal: broken });
  if (errors.length === 0) throw new Error("selftest: planted defect did not fail the guard");
  if (checkSources(original).length > 0) throw new Error("selftest: original sources must remain good");
  console.log("verify-driver-create-dob-mx-license-wired --selftest OK");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = checkSources(readAll());
  if (errors.length) {
    console.error("verify-driver-create-dob-mx-license-wired FAIL:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("verify-driver-create-dob-mx-license-wired OK");
}

main();
