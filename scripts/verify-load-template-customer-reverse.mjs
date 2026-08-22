#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["dispatch.modal.save_load_template"],"task":"DISP-F5861-SAVE-LOAD-TEMPLATE-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const MATRIX = "docs/specs/scoreboard/modules/dispatch.required.json";
const SELF = "scripts/verify-load-template-customer-reverse.mjs";
const HEADER = '/** @matrix-built {"modules":["dispatch"],"cols":["reverse_link"],"leaves":["dispatch.modal.save_load_template"],"task":"DISP-F5861-SAVE-LOAD-TEMPLATE-REVERSE-EXACT-LEAF","vertical":"column-wave"} */';
const files = {
  routes: read("apps/backend/src/dispatch/dispatch-refinements.routes.ts"),
  service: read("apps/backend/src/dispatch/dispatch-refinements.service.ts"),
  api: read("apps/frontend/src/api/dispatch.ts"),
  reverse: read("apps/frontend/src/components/dispatch/CustomerLoadTemplatesReverseSection.tsx"),
  customer: read("apps/frontend/src/pages/CustomerDetail.tsx"),
  library: read("apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx"),
  matrix: read(MATRIX),
  self: read(SELF),
};
function failures(s = files) {
  let required = false;
  try {
    required = JSON.parse(s.matrix).leaves?.find((leaf) => leaf.id === "dispatch.modal.save_load_template")?.required?.includes("reverse_link") === true;
  } catch {}
  return [
  ["company-scoped customer/template filters", s.routes.includes("customer_id: z.string().uuid().optional()") && s.routes.includes("template_id: z.string().uuid().optional()") && s.service.includes("template_json->>'customer_id' = $${values.length}") && s.service.includes("id = $${values.length}::uuid")],
  ["filtered customer profile read", s.reverse.includes("listLoadTemplates(operatingCompanyId, { customer_id: customerId })") && s.api.includes('params.set("customer_id", filters.customer_id)')],
  ["customer profile mount", s.customer.includes("<CustomerLoadTemplatesReverseSection operatingCompanyId={operatingCompanyId} customerId={id} />")],
  ["exact template drill", s.reverse.includes('kind="load_template"') && s.reverse.includes("id={template.id}") && s.library.includes('searchParams.get("template_id")') && s.library.includes("template_id: templateId")],
  ["visible customer EntityPicker", s.library.includes('dataTestId="load-template-library-filter-customer"') && s.library.includes("allowCreate={false}") && s.library.includes("customer_id: effectiveCustomerId")],
  ["honest reverse states", s.reverse.includes("Load templates unavailable.") && s.reverse.includes("!query.isLoading && !query.isError")],
  ["exact Required ownership", required],
  ["exact Built annotation", s.self.split("\n").includes(HEADER)],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, service: files.service.replace("template_json->>'customer_id' = $${values.length}", "TRUE") }).includes("company-scoped customer/template filters"),
    failures({ ...files, reverse: files.reverse.replace("listLoadTemplates(operatingCompanyId, { customer_id: customerId })", "listLoadTemplates(operatingCompanyId)") }).includes("filtered customer profile read"),
    failures({ ...files, customer: "" }).includes("customer profile mount"),
    failures({ ...files, library: files.library.replace("template_id: templateId", "") }).includes("exact template drill"),
    failures({ ...files, library: files.library.replace('dataTestId="load-template-library-filter-customer"', 'dataTestId="x"') }).includes("visible customer EntityPicker"),
    failures({ ...files, reverse: files.reverse.split("!query.isLoading && !query.isError").join("!query.isLoading") }).includes("honest reverse states"),
    failures({ ...files, matrix: files.matrix.replace('"id": "dispatch.modal.save_load_template"', '"id": "dispatch.modal.save_load_template.removed"') }).includes("exact Required ownership"),
    failures({ ...files, self: files.self.replace('"leaves":["dispatch.modal.save_load_template"]', '"leaves":["dispatch.modal.load_create"]') }).includes("exact Built annotation"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-load-template-customer-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-load-template-customer-reverse selftest PASS — 8/8 runtime/matrix/header mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-load-template-customer-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-load-template-customer-reverse PASS — customer profiles return to exact canonical load templates");
