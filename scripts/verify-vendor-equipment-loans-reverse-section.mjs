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
const FILES = [SERVICE, ROUTES, API, HOME, SECTION, VENDOR_DETAIL];
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

  if (!/vendorId\?:\s*string/.test(service)) {
    problems.push(`${SERVICE}: listEquipmentLoans must accept an optional vendorId param`);
  }
  if (!/AND l\.lender_vendor_id = \$/.test(service)) {
    problems.push(`${SERVICE}: listEquipmentLoans must filter by lender_vendor_id server-side when vendorId provided`);
  }
  if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(routes)) {
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
  if (!/<VendorEquipmentLoansReverseSection[\s\S]*?vendorId=\{vendor\.id\}/.test(vendorDetail)) {
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

  return problems;
}

function selftest() {
  const good = {
    [SERVICE]: `
      export async function listEquipmentLoans(userId: string, operatingCompanyId: string, status?: string, vendorId?: string) {
        if (vendorId) {
          values.push(vendorId);
          whereSql += \` AND l.lender_vendor_id = $\${values.length}::uuid\`;
        }
      }
    `,
    [ROUTES]: `
      const loanListQuerySchema = z.object({
        vendor_id: z.string().uuid().optional(),
      });
      const rows = await listEquipmentLoans(user.uuid, query.data.operating_company_id, query.data.status, query.data.vendor_id);
    `,
    [API]: `
      export function listEquipmentLoans(companyId: string, vendorId?: string) {
        return apiRequest(\`/api/v1/banking/equipment-loans\`);
      }
    `,
    [HOME]: `
      const [searchParams, setSearchParams] = useSearchParams();
      const deepLinkVendorId = searchParams.get("vendor_id");
      const equipmentLoansQuery = useQuery({
        queryFn: () => listEquipmentLoans(companyId, deepLinkVendorId ?? undefined),
      });
      dataTestId="factoring-home-filter-vendor"
    `,
    [SECTION]: `listEquipmentLoans(operatingCompanyId, vendorId).then((r) => r.rows)
      equipment_loans_vendor
      entityLabel(loan.equipment_number, loan.equipment_id, "Equipment")`,
    [VENDOR_DETAIL]: `
      import { VendorEquipmentLoansReverseSection } from "../components/vendors/VendorEquipmentLoansReverseSection";
      <VendorEquipmentLoansReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
    `,
  };
  const goodProblems = assertVendorEquipmentLoansReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [SERVICE]: good[SERVICE].replace("status?: string, vendorId?: string", "status?: string") },
    { ...good, [SERVICE]: good[SERVICE].replace("AND l.lender_vendor_id = $", "") },
    { ...good, [ROUTES]: good[ROUTES].replace("vendor_id: z.string().uuid().optional(),", "") },
    { ...good, [ROUTES]: good[ROUTES].replace(", query.data.vendor_id)", ")") },
    { ...good, [API]: good[API].replace("vendorId?: string", "") },
    { ...good, [HOME]: good[HOME].replace('searchParams.get("vendor_id")', '""') },
    { ...good, [HOME]: good[HOME].replace(/setSearchParams/g, "setUrlParams") },
    { ...good, [HOME]: good[HOME].replace("listEquipmentLoans(companyId, deepLinkVendorId ?? undefined)", "listEquipmentLoans(companyId)") },
    { ...good, [SECTION]: good[SECTION].replace("listEquipmentLoans(operatingCompanyId, vendorId)", "") },
    { ...good, [VENDOR_DETAIL]: good[VENDOR_DETAIL].replace("import { VendorEquipmentLoansReverseSection }", "// removed") },
    { ...good, [VENDOR_DETAIL]: good[VENDOR_DETAIL].replace("vendorId={vendor.id}", "") },
    { ...good, [SECTION]: good[SECTION].replace("entityLabel", "rawLabel") },
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertVendorEquipmentLoansReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertVendorEquipmentLoansReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
