#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["reverse_link"],"leafRe":"^(property_tax\\.(list|detail)|form2290)$","task":"VERTICAL-REVERSE-LINK-COMPLIANCE-TAX-FILINGS"} */
import fs from "node:fs";

const files = {
  propertyRoutes: fs.readFileSync("apps/backend/src/compliance/property-tax/property-tax.routes.ts", "utf8"),
  propertyService: fs.readFileSync("apps/backend/src/compliance/property-tax/property-tax.service.ts", "utf8"),
  formRoutes: fs.readFileSync("apps/backend/src/compliance/form-2290.routes.ts", "utf8"),
  profile: fs.readFileSync("apps/frontend/src/pages/fleet/VehicleProfilePage.tsx", "utf8"),
  section: fs.readFileSync("apps/frontend/src/components/compliance/UnitTaxFilingsReverseSection.tsx", "utf8"),
  propertyPage: fs.readFileSync("apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx", "utf8"),
  formPage: fs.readFileSync("apps/frontend/src/pages/compliance/Form2290Filings.tsx", "utf8"),
};

function failures(source = files) {
  return [
    ["property-tax company/unit filter", source.propertyRoutes.includes("renditionListQuery.safeParse") && source.propertyService.includes("l.operating_company_id = r.operating_company_id") && source.propertyService.includes("l.unit_id = $2::uuid")],
    ["Form 2290 company/unit filter", source.formRoutes.includes("filingListQuery.safeParse") && source.formRoutes.includes("v.operating_company_id = compliance.form_2290_filings.operating_company_id") && source.formRoutes.includes("v.vehicle_id = $2::uuid")],
    ["unit profile reverse section", source.profile.includes("<UnitTaxFilingsReverseSection operatingCompanyId={companyId} unitId={id} />")],
    ["property-tax list and detail drills", source.section.includes('kind="property_tax_unit"') && source.section.includes("id={unitId}") && source.section.includes('kind="property_tax_rendition"') && source.section.includes("id={rendition.id}") && source.propertyPage.includes('searchParams.get("unit_id")') && source.propertyPage.includes('kind="property_tax_rendition"')],
    ["property-tax EntityPicker unit filter", source.propertyPage.includes('dataTestId="property-tax-filter-unit"') && source.propertyPage.includes('kind="unit"') && source.propertyPage.includes("allowCreate={false}") && source.propertyPage.includes("effectiveUnitId")],
    ["Form 2290 exact filing drill", source.section.includes('kind="form_2290_filing"') && source.section.includes("id={filing.id}") && source.formPage.includes('searchParams.get("filing_id")') && source.formPage.includes("String(filing.id) === filingId")],
    ["tax filing failures cannot masquerade as empty", source.section.includes("<ListErrorState") && source.section.includes("Promise.all([propertyTaxQ.refetch(), form2290Q.refetch()])") && source.section.includes("!propertyTaxQ.isError && !form2290Q.isError && renditions.length === 0")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, propertyService: files.propertyService.replace("l.unit_id = $2::uuid", "TRUE") }).includes("property-tax company/unit filter"),
    failures({ ...files, formRoutes: files.formRoutes.replace("v.vehicle_id = $2::uuid", "TRUE") }).includes("Form 2290 company/unit filter"),
    failures({ ...files, profile: files.profile.replace("<UnitTaxFilingsReverseSection", "<MissingTaxReverseSection") }).includes("unit profile reverse section"),
    failures({ ...files, section: files.section.replace('kind="property_tax_rendition"', 'kind="unit"') }).includes("property-tax list and detail drills"),
    failures({ ...files, propertyPage: files.propertyPage.replace('dataTestId="property-tax-filter-unit"', 'dataTestId="broken"') }).includes("property-tax EntityPicker unit filter"),
    failures({ ...files, formPage: files.formPage.replace("String(filing.id) === filingId", "true") }).includes("Form 2290 exact filing drill"),
    failures({ ...files, section: files.section.replace('kind="form_2290_filing"', 'kind="unit"') }).includes("Form 2290 exact filing drill"),
    failures({ ...files, section: files.section.replace("!propertyTaxQ.isError && !form2290Q.isError && renditions.length === 0", "renditions.length === 0") }).includes("tax filing failures cannot masquerade as empty"),
  ];
  if (checks.some((ok) => !ok)) {
    console.error(`verify-compliance-tax-filings-unit-reverse selftest FAIL — mutations ${checks.map((ok, index) => ok ? null : index + 1).filter(Boolean).join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-compliance-tax-filings-unit-reverse selftest PASS — 8/8 API/profile/target/error mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-compliance-tax-filings-unit-reverse FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-compliance-tax-filings-unit-reverse PASS — unit profile resolves exact property-tax and Form 2290 records");
