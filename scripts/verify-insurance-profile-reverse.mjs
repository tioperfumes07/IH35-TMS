#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["reverse_link"],"leafRe":"^(coverage_gaps|lawsuits\\.list)$","task":"VERTICAL-REVERSE-LINK-INSURANCE-PROFILES"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  summaryRoutes: read("apps/backend/src/insurance/summary.routes.ts"),
  coverageSql: read("apps/backend/src/insurance/coverage-gap-units.shared.ts"),
  lawsuitRoutes: read("apps/backend/src/insurance/lawsuit.routes.ts"),
  lawsuitSchema: read("apps/backend/src/insurance/claim.shared.ts"),
  coveragePage: read("apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx"),
  insuranceSummary: read("apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx"),
  lawsuitReverse: read("apps/frontend/src/components/insurance/InsuranceLawsuitsReverseSection.tsx"),
  lawsuitPage: read("apps/frontend/src/pages/insurance/LawsuitsTab.tsx"),
  insuranceApi: read("apps/frontend/src/api/insurance.ts"),
  driverProfile: read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  unitProfile: read("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"),
};
function failures(s = files) { return [
  ["coverage gap company/unit API filter", s.summaryRoutes.includes("coverageGapQuerySchema.safeParse") && s.summaryRoutes.includes("parsed.data.unit_id ?? null") && s.coverageSql.includes("$3::uuid IS NULL OR u.id = $3::uuid")],
  ["unit profile exact coverage target", s.insuranceSummary.includes('kind="insurance_coverage_gaps"') && s.insuranceSummary.includes("id={unitId}") && s.coveragePage.includes('searchParams.get("unit_id")') && s.coveragePage.includes('dataTestId="coverage-gap-filter-unit"') && s.coveragePage.includes("allowCreate={false}")],
  ["lawsuit driver/unit backend filters", s.lawsuitSchema.includes("driver_id: z.string().uuid().optional()") && s.lawsuitSchema.includes("unit_id: z.string().uuid().optional()") && s.lawsuitRoutes.includes("claim.driver_id = $${values.length}::uuid") && s.lawsuitRoutes.includes("asset.unit_id = $${values.length}::uuid")],
  ["driver and unit reverse consumers", s.driverProfile.includes('filter={{ driver_id: id }} contextLabel="this driver"') && s.unitProfile.includes('filter={{ unit_id: id }} contextLabel="this unit"')],
  ["exact lawsuit drill", s.lawsuitReverse.includes('<EntityLink kind="lawsuit" id={row.id}') && s.lawsuitReverse.includes("listInsuranceLawsuits({ operating_company_id: operatingCompanyId, ...filter })")],
  ["lawsuit human labels projected with entity scope", s.lawsuitRoutes.includes("claim.claim_number") && s.lawsuitRoutes.includes("AS driver_name") && s.lawsuitRoutes.includes("unit.unit_number") && s.lawsuitRoutes.includes("driver.operating_company_id = lawsuit.tenant_id") && s.lawsuitRoutes.includes("COALESCE(unit.currently_leased_to_company_id, unit.owner_company_id) = lawsuit.tenant_id")],
  ["lawsuit label payload typed", ["claim_number: string | null", "driver_name: string | null", "unit_number: string | null"].every((token) => s.insuranceApi.includes(token))],
  // LawsuitsTab migrated its EntityLink columns to EntityLinkOrTombstone, which computes
  // entityLabel(name, id, noun) INTERNALLY (and renders the honest tombstone when id is missing) —
  // callers just pass the raw name/id/noun now, they no longer call entityLabel(...) inline.
  ["lawsuit links consume human labels", s.lawsuitPage.includes('kind="claim" id={lawsuit.claim_id} name={lawsuit.claim_number} noun="Claim"') && s.lawsuitPage.includes('kind="driver" id={lawsuit.driver_id} name={lawsuit.driver_name} noun="Driver"') && s.lawsuitPage.includes('kind="unit" id={lawsuit.unit_id} name={lawsuit.unit_number} noun="Unit"')],
].filter(([,ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({...files, coverageSql: files.coverageSql.replace("$3::uuid IS NULL OR u.id = $3::uuid", "TRUE")}).includes("coverage gap company/unit API filter"),
    failures({...files, insuranceSummary: files.insuranceSummary.replace('kind="insurance_coverage_gaps"', 'kind="unit"')}).includes("unit profile exact coverage target"),
    failures({...files, lawsuitRoutes: files.lawsuitRoutes.replace("claim.driver_id = $${values.length}::uuid", "TRUE")}).includes("lawsuit driver/unit backend filters"),
    failures({...files, driverProfile: ""}).includes("driver and unit reverse consumers"),
    failures({...files, lawsuitReverse: files.lawsuitReverse.replace('kind="lawsuit" id={row.id}', 'kind="claim" id={row.id}')}).includes("exact lawsuit drill"),
    failures({...files, lawsuitRoutes: files.lawsuitRoutes.replace("driver.operating_company_id = lawsuit.tenant_id", "TRUE")}).includes("lawsuit human labels projected with entity scope"),
    failures({...files, insuranceApi: files.insuranceApi.replace("driver_name: string | null", "")}).includes("lawsuit label payload typed"),
    failures({...files, lawsuitPage: files.lawsuitPage.replace("lawsuit.unit_number", "null")}).includes("lawsuit links consume human labels"),
  ];
  if (checks.some((ok)=>!ok)) { console.error(`verify-insurance-profile-reverse selftest FAIL — mutations ${checks.map((ok,i)=>ok?null:i+1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-insurance-profile-reverse selftest PASS — 8/8 API/profile/target/label mutations red"); process.exit(0);
}
const missing=failures(); if(missing.length){console.error(`verify-insurance-profile-reverse FAIL — ${missing.join(", ")}`);process.exit(1)}
console.log("verify-insurance-profile-reverse PASS — coverage gaps and lawsuits return to exact unit/driver records");
