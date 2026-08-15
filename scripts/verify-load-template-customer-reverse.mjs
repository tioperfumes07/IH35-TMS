#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leafRe":"^dispatch\\.modal\\.save_load_template$","task":"VERTICAL-REVERSE-LINK-LOAD-TEMPLATE-CUSTOMER"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  routes: read("apps/backend/src/dispatch/dispatch-refinements.routes.ts"),
  service: read("apps/backend/src/dispatch/dispatch-refinements.service.ts"),
  api: read("apps/frontend/src/api/dispatch.ts"),
  reverse: read("apps/frontend/src/components/dispatch/CustomerLoadTemplatesReverseSection.tsx"),
  customer: read("apps/frontend/src/pages/CustomerDetail.tsx"),
  library: read("apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx"),
};
function failures(s = files) { return [
  ["company-scoped customer/template filters", s.routes.includes("customer_id: z.string().uuid().optional()") && s.routes.includes("template_id: z.string().uuid().optional()") && s.service.includes("template_json->>'customer_id' = $${values.length}") && s.service.includes("id = $${values.length}::uuid")],
  ["filtered customer profile read", s.reverse.includes("listLoadTemplates(operatingCompanyId, { customer_id: customerId })") && s.api.includes('params.set("customer_id", filters.customer_id)')],
  ["customer profile mount", s.customer.includes("<CustomerLoadTemplatesReverseSection operatingCompanyId={operatingCompanyId} customerId={id} />")],
  ["exact template drill", s.reverse.includes('kind="load_template"') && s.reverse.includes("id={template.id}") && s.library.includes('searchParams.get("template_id")') && s.library.includes("template_id: templateId")],
  ["visible customer EntityPicker", s.library.includes('dataTestId="load-template-library-filter-customer"') && s.library.includes("allowCreate={false}") && s.library.includes("customer_id: effectiveCustomerId")],
  ["honest reverse states", s.reverse.includes("Load templates unavailable.") && s.reverse.includes("!query.isLoading && !query.isError")],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, service: files.service.replace("template_json->>'customer_id' = $${values.length}", "TRUE") }).includes("company-scoped customer/template filters"),
    failures({ ...files, reverse: files.reverse.replace("listLoadTemplates(operatingCompanyId, { customer_id: customerId })", "listLoadTemplates(operatingCompanyId)") }).includes("filtered customer profile read"),
    failures({ ...files, customer: "" }).includes("customer profile mount"),
    failures({ ...files, library: files.library.replace("template_id: templateId", "") }).includes("exact template drill"),
    failures({ ...files, library: files.library.replace('dataTestId="load-template-library-filter-customer"', 'dataTestId="x"') }).includes("visible customer EntityPicker"),
    failures({ ...files, reverse: files.reverse.split("!query.isLoading && !query.isError").join("!query.isLoading") }).includes("honest reverse states"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-load-template-customer-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-load-template-customer-reverse selftest PASS — 6/6 filter/profile/target/state mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-load-template-customer-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-load-template-customer-reverse PASS — customer profiles return to exact canonical load templates");
