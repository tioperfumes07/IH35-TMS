#!/usr/bin/env node
/** @matrix-built {"modules":["factoring"],"cols":["reverse_link"],"leafRe":"^home\\.equipment_loans$","task":"LINK-F5182-vendor-equipment-loans-reverse"} */
/**
 * GUARD: a lender vendor's own profile shows the equipment loans it holds against this company
 * (LINK-F5171 reverse_link sweep gap factoring:home.equipment_loans, vendor side -- the unit side
 * was already genuinely built via UnitFinanceLinkageTab.tsx, confirmed during the LINK-F5171
 * investigation).
 *
 * listEquipmentLoans already selects lender_vendor_id (via SELECT l.*) on every row, but accepted
 * no vendor filter param, and VendorDetail.tsx never called or linked to it.
 *
 * Fix contract this guard pins:
 *   1. data-infra.service.ts's listEquipmentLoans accepts an optional vendorId param and applies
 *      it server-side to the SQL WHERE clause.
 *   2. data-infra.routes.ts's loanListQuerySchema accepts optional vendor_id and forwards it.
 *   3. apps/frontend/src/api/data-infra.ts's listEquipmentLoans accepts and forwards vendorId.
 *   4. FactoringHome.tsx reads vendor_id from the URL and forwards it to the query.
 *   5. VendorEquipmentLoansReverseSection.tsx (new) queries the vendor-scoped endpoint and links
 *      back to /factoring/equipment-loans?vendor_id=; VendorDetail.tsx mounts it.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/data-infra/data-infra.service.ts";
const ROUTES = "apps/backend/src/data-infra/data-infra.routes.ts";
const API = "apps/frontend/src/api/data-infra.ts";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";
const SECTION = "apps/frontend/src/components/vendors/VendorEquipmentLoansReverseSection.tsx";
const VENDOR_DETAIL = "apps/frontend/src/pages/VendorDetail.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const FILES = [SERVICE, ROUTES, API, HOME, SECTION, VENDOR_DETAIL, ENTITY_LINK];
const LABEL = "verify-vendor-equipment-loans-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertVendorEquipmentLoansReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const service = src[SERVICE];
  const routes = src[ROUTES];
  const api = src[API];
  const home = src[HOME];
  const section = src[SECTION];
  const vendorDetail = src[VENDOR_DETAIL];
  const entityLink = src[ENTITY_LINK];

  if (!/export async function listEquipmentLoans\(userId: string, operatingCompanyId: string, status\?: string, vendorId\?: string\)/.test(service)) {
    problems.push(`${SERVICE}: listEquipmentLoans must accept an optional vendorId param`);
  }
  if (!/AND l\.lender_vendor_id = \$/.test(service)) {
    problems.push(`${SERVICE}: listEquipmentLoans must filter by lender_vendor_id server-side when vendorId provided`);
  }
  if (!/const loanListQuerySchema = z\.object\(\{[\s\S]{0,700}vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: loanListQuerySchema must accept optional vendor_id`);
  }
  if (!/listEquipmentLoans\(user\.uuid, query\.data\.operating_company_id, query\.data\.status, query\.data\.vendor_id\)/.test(routes)) {
    problems.push(`${ROUTES}: must forward vendor_id to listEquipmentLoans`);
  }
  if (!/export function listEquipmentLoans\(companyId: string, vendorId\?: string\)/.test(api)) {
    problems.push(`${API}: listEquipmentLoans must accept optional vendorId`);
  }
  if (!/searchParams\.get\("vendor_id"\)/.test(home)) {
    problems.push(`${HOME}: must read vendor_id from URL search params`);
  }
  if (!/listEquipmentLoans\(companyId, deepLinkVendorId/.test(home)) {
    problems.push(`${HOME}: must forward deepLinkVendorId to listEquipmentLoans`);
  }
  // LST-F5193 — visible vendor filter must write URL.
  if (!/setSearchParams/.test(home) || !/dataTestId="factoring-home-filter-vendor"/.test(home)) {
    problems.push(`${HOME}: equipment loans reverse filter must sync to URL (setSearchParams + vendor EntityPicker)`);
  }
  if (!/listEquipmentLoans\(operatingCompanyId, vendorId\)/.test(section)) {
    problems.push(`${SECTION}: must query equipment loans scoped to vendorId`);
  }
  if (!/import\s*\{\s*VendorEquipmentLoansReverseSection\s*\}/.test(vendorDetail)) {
    problems.push(`${VENDOR_DETAIL}: must import VendorEquipmentLoansReverseSection`);
  }
  if (!/<VendorEquipmentLoansReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\} \/>/.test(vendorDetail)) {
    problems.push(`${VENDOR_DETAIL}: must mount <VendorEquipmentLoansReverseSection vendorId={vendor.id} .../>`);
  }

  if (!/equipment_loans_vendor/.test(section)) {
    problems.push(`${SECTION}: must use EntityLink kind equipment_loans_vendor`);
  }
  if (/from "react-router-dom"/.test(section)) {
    problems.push(`${SECTION}: must not import react-router Link`);
  }
  if (!/entityLabel\(loan\.equipment_number, loan\.equipment_id, "Equipment"\)/.test(section)) {
    problems.push(`${SECTION}: equipment label must reject raw equipment-id fallback`);
  }
  if (!/kind="equipment_loan"[\s\S]{0,100}id=\{loan\.id\}/.test(section)) {
    problems.push(`${SECTION}: every returned row must drill by its exact canonical loan id`);
  }
  if (!/searchParams\.get\("loan_id"\)/.test(home) ||
      !/row\.id\) === loanIdFromUrl[\s\S]{0,120}setSelectedLoanId\(String\(requestedLoan\.id\)\)/.test(home)) {
    problems.push(`${HOME}: exact loan_id deep link must select the returned loan row`);
  }
  if (!/case "equipment_loan":[\s\S]{0,100}\/factoring\/equipment-loans\?loan_id=\$\{id\}/.test(entityLink)) {
    problems.push(`${ENTITY_LINK}: equipment_loan must route by canonical loan_id`);
  }

  return problems;
}

function selftest() {
  const good = Object.fromEntries(FILES.map((rel) => [rel, read(rel)]));
  const goodProblems = assertVendorEquipmentLoansReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    [SERVICE, /export async function listEquipmentLoans\(userId: string, operatingCompanyId: string, status\?: string, vendorId\?: string\)/, "export async function listEquipmentLoans(userId: string, operatingCompanyId: string, status?: string)"],
    [SERVICE, /AND l\.lender_vendor_id = \$/, "AND TRUE = $"],
    [ROUTES, /const loanListQuerySchema = z\.object\(\{[\s\S]{0,700}vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/, "const loanListQuerySchema = z.object({ vendor_id: z.never()"],
    [ROUTES, /query\.data\.status, query\.data\.vendor_id/, "query.data.status, undefined"],
    [API, /export function listEquipmentLoans\(companyId: string, vendorId\?: string\)/, "export function listEquipmentLoans(companyId: string)"],
    [HOME, /searchParams\.get\("vendor_id"\)/, 'searchParams.get("missing_vendor")'],
    [HOME, /listEquipmentLoans\(companyId, deepLinkVendorId/, "listEquipmentLoans(companyId, undefined"],
    [HOME, /dataTestId="factoring-home-filter-vendor"/, 'dataTestId="missing-vendor-filter"'],
    [SECTION, /listEquipmentLoans\(operatingCompanyId, vendorId\)/, "listEquipmentLoans(operatingCompanyId)"],
    [VENDOR_DETAIL, /import \{ VendorEquipmentLoansReverseSection \}/, "import { MissingEquipmentLoansSection }"],
    [VENDOR_DETAIL, /<VendorEquipmentLoansReverseSection operatingCompanyId=\{companyId\} vendorId=\{vendor\.id\} \/>/, "<VendorEquipmentLoansReverseSection operatingCompanyId={companyId} vendorId={undefined} />"],
    [SECTION, /entityLabel\(loan\.equipment_number, loan\.equipment_id, "Equipment"\)/, "String(loan.equipment_id)"],
    [SECTION, /kind="equipment_loan"/, 'kind="equipment_loans_vendor"'],
    [SECTION, /id=\{loan\.id\}/, "id={vendorId}"],
    [HOME, /searchParams\.get\("loan_id"\)/, 'searchParams.get("missing_loan")'],
    [HOME, /setSelectedLoanId\(String\(requestedLoan\.id\)\)/, "setSelectedLoanId(vendorIdFromUrl)"],
    [ENTITY_LINK, /case "equipment_loan":/, 'case "missing_equipment_loan":'],
    [ENTITY_LINK, /\/factoring\/equipment-loans\?loan_id=\$\{id\}/, "/factoring/equipment-loans"],
  ];
  for (const [i, [file, pattern, replacement]] of mutations.entries()) {
    const changed = good[file].replace(pattern, replacement);
    if (changed === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} was inert`);
      process.exit(1);
    }
    if (assertVendorEquipmentLoansReverse({ ...good, [file]: changed }).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — production mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} production-source mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertVendorEquipmentLoansReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
