#!/usr/bin/env node
/** @matrix-built {"modules":["fleet"],"cols":["trailer"],"leafRe":"^(trailer\\.profile\\.(identity|specs|assignment|reefer|maintenance|compliance|insurance_claims_reverse|safety_reverse|documents|bank_txns|legal_reverse|expenses_reverse|audit_history|action_bar)|trailer\\.status_change|trailer\\.edit)$","task":"LINK-F5163-TRAILER-PROFILE-SELF-REFERENTIAL"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14): TrailerProfilePage.tsx's 13
 * data-testid-scoped sections plus its Status-Change and Edit modals are all genuinely, self-
 * referentially scoped to THIS trailer (the page's own :id route param) — identity/specs/assignment/
 * reefer/maintenance/compliance mount real trailer-shaped data, and the 4 reverse-drill sections
 * (insurance claims, safety records, legal matters, expenses) each filter on this trailer's own id
 * (trailer_id or equipment_id, per the trailer-vs-unit key-space distinction the file itself documents
 * for legal matters). Bank txns use linkage kind="trailer_id". Documents/audit-history/action-bar all
 * key on the same route-param id.
 *
 * Self-test: node scripts/verify-trailer-profile-page-self-referential.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx";
const ROUTE_FILE = "apps/backend/src/mdata/equipment.routes.ts";
const PDF_FILE = "apps/backend/src/mdata/equipment-pdf-export.routes.ts";
const LABEL = "verify-trailer-profile-page-self-referential";

const SECTION_CHECKS = [
  ["identity", /tp-section-1-identity"[\s\S]{0,80}<IdentityStatusHeader/],
  ["specs", /tp-section-2-specs"[\s\S]{0,80}<TypeSpecsSection/],
  ["assignment", /tp-section-3-assignment"[\s\S]{0,80}<CurrentAssignmentSection/],
  ["reefer", /tp-section-4-reefer"[\s\S]{0,80}<ReeferTelemetrySection/],
  ["maintenance", /tp-section-5-maintenance"[\s\S]{0,150}<ServiceTimeline companyId=\{companyId\} equipmentId=\{id\}/],
  ["compliance", /tp-section-6-compliance"[\s\S]{0,80}<ComplianceSection/],
  ["insurance_claims_reverse", /tp-section-6b-insurance-claims"[\s\S]{0,150}filter=\{\{ trailer_id: id \}\}/],
  ["safety_reverse", /tp-section-6c-safety-records"[\s\S]{0,150}assetKind="trailer"\s*\n\s*assetId=\{id\}/],
  ["expenses_reverse", /tp-section-6e-expenses"[\s\S]{0,150}filter=\{\{ trailer_id: id \}\}/],
  ["documents", /tp-section-7-documents"[\s\S]{0,80}<DocumentsSection\s*\n\s*equipmentId=\{id\}/],
  ["bank_txns", /tp-section-7b-linked-bank-txns"[\s\S]{0,150}linkage=\{\{ kind: "trailer_id", id \}\}/],
  ["legal_reverse", /tp-section-7c-legal-matters"[\s\S]{0,600}filter=\{\{ equipment_id: id \}\}/],
  ["audit_history", /tp-section-audit-history"[\s\S]{0,300}entityType="equipment" entityId=\{id\}/],
  ["action_bar", /tp-section-8-action-bar"[\s\S]{0,80}<ActionBar\s*\n\s*equipmentId=\{id\}/],
  ["status_change", /<StatusChangeModal[\s\S]{0,200}open=\{statusModalOpen\}/],
  ["edit", /<EditTrailerModal[\s\S]{0,200}open=\{editModalOpen\}/],
];

export function audit(src, routeSrc, pdfSrc) {
  const failures = [];
  for (const [name, pattern] of SECTION_CHECKS) {
    if (!pattern.test(src)) failures.push(`${FILE}: ${name} section is missing its self-referential trailer scoping`);
  }
  if (!/const scopedCompanyId = await resolveOperatingCompanyId\([\s\S]{0,180}authUser\.uuid,[\s\S]{0,120}parsedAggregateQuery\.data\.operating_company_id[\s\S]{0,160}buildEquipmentAggregate\(client, parsedParams\.data\.id, scopedCompanyId\)/.test(routeSrc)) {
    failures.push(`${ROUTE_FILE}: trailer aggregate GET must resolve caller membership before selecting aggregate scope`);
  }
  if (!/const scopedCompanyId = await resolveOperatingCompanyId\([\s\S]{0,180}user\.uuid,[\s\S]{0,120}query\.data\.operating_company_id[\s\S]{0,180}buildEquipmentAggregate\(client, params\.data\.id, scopedCompanyId\)/.test(pdfSrc)) {
    failures.push(`${PDF_FILE}: trailer PDF GET must resolve caller membership before selecting aggregate scope`);
  }
  return failures;
}

function sources() {
  return {
    page: fs.readFileSync(path.join(ROOT, FILE), "utf8"),
    route: fs.readFileSync(path.join(ROOT, ROUTE_FILE), "utf8"),
    pdf: fs.readFileSync(path.join(ROOT, PDF_FILE), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = sources();
  if (audit(good.page, good.route, good.pdf).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good.page, good.route, good.pdf).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [name, pattern] of SECTION_CHECKS) {
    const mutated = good.page.replace(pattern, "REMOVED");
    if (mutated === good.page) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    const failures = audit(mutated, good.route, good.pdf);
    if (!failures.some((f) => f.includes(name))) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  for (const [name, key, pattern] of [
    ["aggregate-membership", "route", /parsedAggregateQuery\.data\.operating_company_id\n\s*\);/],
    ["pdf-membership", "pdf", /query\.data\.operating_company_id\n\s*\);/],
  ]) {
    const mutated = good[key].replace(pattern, "undefined\n        );");
    if (mutated === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    const failures = audit(
      good.page,
      key === "route" ? mutated : good.route,
      key === "pdf" ? mutated : good.pdf
    );
    if (!failures.some((f) => f.includes("resolve caller membership"))) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const current = sources();
const failures = audit(current.page, current.route, current.pdf);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — TrailerProfilePage's ${SECTION_CHECKS.length} trailer-scoped sections/modals are real, self-referential wiring`);
