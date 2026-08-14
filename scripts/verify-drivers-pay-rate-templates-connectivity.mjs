#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leafRe":"^pay_rate_templates$","task":"VERTICAL-CONNECTIVITY-DRIVER-PAY-RATE-TEMPLATES"} */
import fs from "node:fs";

const drivers = fs.readFileSync("apps/frontend/src/pages/Drivers.tsx", "utf8");
const list = fs.readFileSync("apps/frontend/src/pages/lists/driver/DriverCatalogListPage.tsx", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/lists/driver/PayRateTemplatesListPage.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/catalogs-driver.ts", "utf8");
const modal = fs.readFileSync("apps/frontend/src/pages/lists/driver/DriverCatalogModal.tsx", "utf8");

function failures(source = drivers) {
  return [
    ["mounted canonical page", source.includes("<PayRateTemplatesListPage />")],
    ["no static handoff", !source.includes("Use Lists &gt; Driver &gt; Pay rate templates")],
    ["canonical client", page.includes("client={payRateTemplatesCatalogClient}")],
    ["company-scoped read", list.includes("operating_company_id: companyId")],
    ["company-scoped create", api.includes("create(operating_company_id: string") && api.includes("payRateTemplatesCatalogClient = createDriverCatalogClient(\"pay-rate-templates\")")],
    ["creator submit", modal.includes("await client.create(operatingCompanyId, body)")],
    ["reload after save", list.includes("void query.refetch();")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const planted = drivers.replace("<PayRateTemplatesListPage />", "<StaticPayRatePlaceholder />");
  if (!failures(planted).includes("mounted canonical page")) process.exit(1);
  console.log("verify-drivers-pay-rate-templates-connectivity selftest PASS — mount mutation red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-drivers-pay-rate-templates-connectivity FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-drivers-pay-rate-templates-connectivity PASS — route→catalog read/create→reload");
