#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["driver","unit","load","connectivity","reverse_link"],"leafRe":"^claims\\.","task":"P33","pr":"#5858"} */
/**
 * Law §9 UI wiring — claim create + legal matter linkage pickers + driver/unit claim reverse.
 *
 * Static guards (no migrations / no money):
 *   1. ClaimCreateModal exposes driver_id / load_id / accident_report_id and posts them
 *   2. LegalMatterFormFields has pickers for claim / lawsuit / driver / unit and payloads include them
 *   3. DriverDetail + DriverProfilePage + VehicleProfile mount InsuranceClaimsReverseSection
 *      (two live driver routes exist — /drivers/:id -> DriverDetail, /drivers/:id/profile ->
 *      DriverProfilePage — both mount the reverse section independently, so both need coverage;
 *      DriverProfilePage was unguarded until this pass even though it was already wired)
 *   4. Claims list API accepts driver_id + unit_id filters (schema + route)
 *
 * Self-test: node scripts/verify-law-claim-legal-ui-linkage.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-law-claim-legal-ui-linkage";

/**
 * @param {{ claimCreate: string, legalForm: string, driverDetail: string, driverProfile: string, vehicleProfile: string, claimShared: string, claimRoutes: string, reverseSection: string }} sources
 * @returns {string[]}
 */
export function computeFailures(sources) {
  const errors = [];

  const { claimCreate, legalForm, driverDetail, driverProfile, vehicleProfile, claimShared, claimRoutes, reverseSection } = sources;

  if (!/driver_id:\s*form\.driver_id/.test(claimCreate) && !/driver_id:\s*form\.driver_id\s*\|\|/.test(claimCreate)) {
    errors.push("ClaimCreateModal must pass driver_id in create payload");
  }
  if (!/data-testid=["']claim-create-driver-field["']/.test(claimCreate)) {
    errors.push("ClaimCreateModal must expose claim-create-driver-field");
  }
  if (!/data-testid=["']claim-create-load-field["']/.test(claimCreate)) {
    errors.push("ClaimCreateModal must expose claim-create-load-field");
  }
  if (!/data-testid=["']claim-create-accident-field["']/.test(claimCreate)) {
    errors.push("ClaimCreateModal must expose claim-create-accident-field");
  }
  if (!/load_id:\s*form\.load_id/.test(claimCreate)) {
    errors.push("ClaimCreateModal must pass load_id in create payload");
  }
  if (!/accident_report_id:\s*form\.accident_report_id/.test(claimCreate)) {
    errors.push("ClaimCreateModal must pass accident_report_id in create payload");
  }

  for (const testId of [
    "legal-matter-insurance-claim-picker",
    "legal-matter-insurance-lawsuit-picker",
    "legal-matter-related-driver-picker",
    "legal-matter-unit-picker",
  ]) {
    if (!new RegExp(`data-testid=["']${testId}["']`).test(legalForm)) {
      errors.push(`LegalMatterFormFields missing ${testId}`);
    }
  }
  for (const [testId, kind] of [
    ["legal-matter-insurance-claim-picker", "insurance_claim"],
    ["legal-matter-insurance-lawsuit-picker", "insurance_lawsuit"],
  ]) {
    const field = legalForm.match(new RegExp(`data-testid=["']${testId}["'][\\s\\S]{0,700}?(?=</label>)`))?.[0] ?? "";
    if (!field.includes(`<EntityPicker`) || !field.includes(`kind="${kind}"`)) {
      errors.push(`LegalMatterFormFields ${testId} must use EntityPicker kind=${kind}`);
    }
    if (field.includes("<SelectCombobox")) {
      errors.push(`LegalMatterFormFields ${testId} must not use capped SelectCombobox options`);
    }
  }
  for (const field of ["insurance_claim_id", "insurance_lawsuit_id", "related_driver_id", "unit_id"]) {
    if (!new RegExp(`${field}:\\s*optionalUuidOrNull\\(form\\.${field}\\)`).test(legalForm)) {
      errors.push(`formStateToUpdatePayload must include ${field}`);
    }
  }

  if (!/InsuranceClaimsReverseSection/.test(driverDetail)) {
    errors.push("DriverDetail must mount InsuranceClaimsReverseSection");
  }
  if (!/driver_id:\s*id/.test(driverDetail) && !/filter=\{\{\s*driver_id:\s*id/.test(driverDetail)) {
    errors.push("DriverDetail claims reverse must filter by driver_id");
  }

  if (!/InsuranceClaimsReverseSection/.test(driverProfile)) {
    errors.push("DriverProfilePage (/drivers/:id/profile) must mount InsuranceClaimsReverseSection");
  }
  if (!/driver_id:\s*id/.test(driverProfile) && !/filter=\{\{\s*driver_id:\s*id/.test(driverProfile)) {
    errors.push("DriverProfilePage claims reverse must filter by driver_id");
  }

  if (!/InsuranceClaimsReverseSection/.test(vehicleProfile)) {
    errors.push("VehicleProfilePage must mount InsuranceClaimsReverseSection");
  }
  if (!/filter=\{\{\s*unit_id:\s*id/.test(vehicleProfile)) {
    errors.push("VehicleProfile claims reverse must filter by unit_id");
  }

  if (!/InsuranceClaimsReverseSection/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection component file missing export");
  }
  if (!/insuranceClaimsApi\.list/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection must list claims via insuranceClaimsApi");
  }
  if (!/query\.isError[\s\S]{0,420}title="Couldn't load linked insurance claims"[\s\S]{0,420}query\.refetch\(\)/.test(reverseSection)) {
    errors.push("InsuranceClaimsReverseSection failed GET must expose exact retry");
  }

  if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(claimShared)) {
    errors.push("listClaimsQuerySchema must accept optional driver_id");
  }
  if (!/unit_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(claimShared)) {
    errors.push("listClaimsQuerySchema must accept optional unit_id");
  }
  if (!/parsed\.data\.driver_id/.test(claimRoutes)) {
    errors.push("claim.routes list must filter by driver_id");
  }
  if (!/assets\.unit_id/.test(claimRoutes)) {
    errors.push("claim.routes list must filter by assets.unit_id for unit reverse");
  }

  return errors;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function selftest() {
  const good = {
    claimCreate: `
      driver_id: form.driver_id || null,
      load_id: form.load_id || null,
      accident_report_id: form.accident_report_id || null,
      data-testid="claim-create-driver-field"
      data-testid="claim-create-load-field"
      data-testid="claim-create-accident-field"
    `,
    legalForm: `
      data-testid="legal-matter-insurance-claim-picker"
      <EntityPicker kind="insurance_claim" />
      </label>
      data-testid="legal-matter-insurance-lawsuit-picker"
      <EntityPicker kind="insurance_lawsuit" />
      </label>
      data-testid="legal-matter-related-driver-picker"
      data-testid="legal-matter-unit-picker"
      insurance_claim_id: optionalUuidOrNull(form.insurance_claim_id),
      insurance_lawsuit_id: optionalUuidOrNull(form.insurance_lawsuit_id),
      related_driver_id: optionalUuidOrNull(form.related_driver_id),
      unit_id: optionalUuidOrNull(form.unit_id),
    `,
    driverDetail: `
      <InsuranceClaimsReverseSection filter={{ driver_id: id }} />
    `,
    driverProfile: `
      <InsuranceClaimsReverseSection filter={{ driver_id: id }} />
    `,
    vehicleProfile: `
      <InsuranceClaimsReverseSection filter={{ unit_id: id }} />
    `,
    claimShared: `
      driver_id: z.string().uuid().optional(),
      unit_id: z.string().uuid().optional(),
    `,
    claimRoutes: `
      if (parsed.data.driver_id) { ... }
      .replace(/^unit_id/, "assets.unit_id")
    `,
    reverseSection: `
      export function InsuranceClaimsReverseSection() {}
      insuranceClaimsApi.list({ operating_company_id, ...filter })
      query.isError title="Couldn't load linked insurance claims" onRetry={() => void query.refetch()}
    `,
  };
  const bad = {
    ...good,
    claimCreate: `asset_id: form.asset_id || null`,
  };
  const goodFails = computeFailures(good);
  const badFails = computeFailures(bad);
  if (goodFails.length !== 0) {
    console.error(`${LABEL} selftest FAIL: good fixture failed`, goodFails);
    process.exit(1);
  }
  if (badFails.length === 0) {
    console.error(`${LABEL} selftest FAIL: bad fixture passed`);
    process.exit(1);
  }
  const cappedPicker = {
    ...good,
    legalForm: good.legalForm.replace('<EntityPicker kind="insurance_claim" />', '<SelectCombobox />'),
  };
  if (!computeFailures(cappedPicker).some((failure) => failure.includes("insurance-claim-picker"))) {
    console.error(`${LABEL} selftest FAIL: capped claim selector mutation passed`);
    process.exit(1);
  }
  const retryRemoved = {
    ...good,
    reverseSection: good.reverseSection.replace("onRetry={() => void query.refetch()}", "onRetry={() => undefined}"),
  };
  if (!computeFailures(retryRemoved).some((failure) => failure.includes("exact retry"))) {
    console.error(`${LABEL} selftest FAIL: insurance reverse retry mutation passed`);
    process.exit(1);
  }
  console.log(`✓ ${LABEL} selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const sources = {
    claimCreate: read("apps/frontend/src/components/insurance/ClaimCreateModal.tsx"),
    legalForm: read("apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx"),
    driverDetail: read("apps/frontend/src/pages/DriverDetail.tsx"),
    driverProfile: read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
    vehicleProfile: read("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"),
    claimShared: read("apps/backend/src/insurance/claim.shared.ts"),
    claimRoutes: read("apps/backend/src/insurance/claim.routes.ts"),
    reverseSection: read("apps/frontend/src/components/insurance/InsuranceClaimsReverseSection.tsx"),
  };

  const failures = computeFailures(sources);
  if (failures.length > 0) {
    console.error(`✗ ${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `✓ ${LABEL}: claim create linkage fields + legal matter pickers + driver/unit claim reverse wired.`,
  );
}

main();
