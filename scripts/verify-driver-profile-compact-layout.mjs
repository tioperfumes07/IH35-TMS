#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DRIVER_DETAIL = "apps/frontend/src/pages/DriverDetail.tsx";
const REQUIRED_SECTIONS = ["identity", "contact", "credentials"];
const REQUIRED_FIELDS = [
  "first_name", "last_name", "phone", "email", "cdl_number", "cdl_expires_at",
  "hire_date", "dot_medical_expires_at", "hazmat_endorsement_expires_at",
];

export function verify(source = fs.readFileSync(path.join(ROOT, DRIVER_DETAIL), "utf8")) {
  const errors = [];
  if (!source.includes('data-testid="driver-profile-layout"') || !source.includes("max-w-[1440px]")) {
    errors.push("driver profile must use a bounded responsive layout");
  }
  if (!source.includes('data-testid={`driver-profile-${section.id}-section`}')) {
    errors.push("driver profile sections must expose their stable manifest ids");
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!source.includes(`id: "${section}"`)) {
      errors.push(`driver profile is missing the ${section} section contract`);
    }
  }
  for (const field of REQUIRED_FIELDS) {
    if (!source.includes(`["${field}",`)) errors.push(`driver profile dropped field ${field}`);
  }
  if (!source.includes('section.id === "credentials" ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"')) {
    errors.push("profile field sections must use compact responsive columns");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(path.join(ROOT, DRIVER_DETAIL), "utf8");
  const clean = verify(source);
  if (clean.length) {
    console.error(`SELFTEST setup failed: ${clean.join("; ")}`);
    process.exit(1);
  }
  const planted = source.replace('id: "contact"', 'id: "contact-removed"');
  const errors = verify(planted);
  if (!errors.some((error) => error.includes("contact section"))) {
    console.error("SELFTEST FAIL: planted missing profile section was not detected");
    process.exit(1);
  }
  console.log("SELFTEST PASS: 1/1 planted missing-section regression detected");
  process.exit(0);
}

const errors = verify();
if (errors.length) {
  console.error("verify-driver-profile-compact-layout: FAIL");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log("verify-driver-profile-compact-layout: PASS");
