#!/usr/bin/env node
/**
 * 0441-mod5-border-creds-no-edit
 *
 * Driver profile border credentials must be editable (FAST/SENTRI/TWIC/Mexican license)
 * via the existing mdata driver PATCH route — not read-only cards.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:driver-border-credentials-edit";

export function validate(section, routes, page, apiTypes) {
  const failures = [];

  if (!/data-testid="dp-edit-border-creds"/.test(section)) {
    failures.push("BorderCredentialsSection must expose dp-edit-border-creds edit affordance");
  }
  if (!/updateDriver\(driverId,\s*borderFormStateToUpdatePayload\(form\)\)/.test(section)) {
    failures.push("BorderCredentialsSection save must PATCH via updateDriver + borderFormStateToUpdatePayload");
  }
  for (const testId of [
    "border-creds-fast-number",
    "border-creds-sentri-member",
    "border-creds-twic-number",
    "border-creds-mx-number",
  ]) {
    if (!new RegExp(`data-testid="${testId}"`).test(section)) {
      failures.push(`BorderCredentialsSection edit modal must include ${testId}`);
    }
  }

  for (const field of [
    "fast_card_number",
    "fast_card_expiration",
    "sentri_member",
    "sentri_expiration",
    "twic_card_number",
    "twic_expiration",
    "mexican_license_number",
    "mexican_license_expiration",
  ]) {
    if (!new RegExp(`${field}:`).test(routes)) {
      failures.push(`drivers.routes updateDriverBodySchema must accept ${field}`);
    }
    if (!new RegExp(`if \\("${field}" in b\\)`).test(routes)) {
      failures.push(`drivers.routes PATCH handler must write ${field}`);
    }
  }

  if (!/<BorderCredentialsSection[\s\S]*?driverId=\{id\}[\s\S]*?onSaved=\{refreshDriver\}/.test(page)) {
    failures.push("DriverProfilePage must wire BorderCredentialsSection with driverId and onSaved");
  }

  for (const field of [
    "fast_card_number",
    "sentri_member",
    "twic_card_number",
    "mexican_license_number",
  ]) {
    if (!new RegExp(`\\|\\s*"${field}"`).test(apiTypes)) {
      failures.push(`UpdateDriverInput must include ${field}`);
    }
  }

  return failures;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function runSelfTest() {
  const validSection = `
    data-testid="dp-edit-border-creds"
    data-testid="border-creds-fast-number"
    data-testid="border-creds-sentri-member"
    data-testid="border-creds-twic-number"
    data-testid="border-creds-mx-number"
    await updateDriver(driverId, borderFormStateToUpdatePayload(form));
  `;
  const validRoutes = `
    fast_card_number:
    fast_card_expiration:
    sentri_member:
    sentri_expiration:
    twic_card_number:
    twic_expiration:
    mexican_license_number:
    mexican_license_expiration:
    if ("fast_card_number" in b)
    if ("fast_card_expiration" in b)
    if ("sentri_member" in b)
    if ("sentri_expiration" in b)
    if ("twic_card_number" in b)
    if ("twic_expiration" in b)
    if ("mexican_license_number" in b)
    if ("mexican_license_expiration" in b)
  `;
  const validPage = `<BorderCredentialsSection border={x} driverId={id} onSaved={refreshDriver} />`;
  const validTypes = `
    | "fast_card_number"
    | "sentri_member"
    | "twic_card_number"
    | "mexican_license_number"
  `;

  const checks = [
    {
      name: "valid fixture passes",
      passed: validate(validSection, validRoutes, validPage, validTypes).length === 0,
    },
    {
      name: "planted missing edit button fails",
      passed: validate(validSection.replace('data-testid="dp-edit-border-creds"', ""), validRoutes, validPage, validTypes).some(
        (f) => f.includes("edit affordance"),
      ),
    },
    {
      name: "planted PATCH omission fails",
      passed: validate(validSection.replace("updateDriver(driverId, borderFormStateToUpdatePayload(form))", ""), validRoutes, validPage, validTypes).some(
        (f) => f.includes("PATCH"),
      ),
    },
  ];
  const failed = checks.filter((check) => !check.passed);
  if (failed.length) {
    for (const check of failed) console.error(` - ${check.name}`);
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
}

if (process.argv.includes("--selftest")) {
  runSelfTest();
} else {
  const failures = validate(
    read("apps/frontend/src/components/driver-profile/BorderCredentialsSection.tsx"),
    read("apps/backend/src/mdata/drivers.routes.ts"),
    read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
    read("apps/frontend/src/types/api.ts"),
  );
  if (failures.length) {
    for (const failure of failures) console.error(` - ${failure}`);
    console.error(`${LABEL} FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS`);
}
