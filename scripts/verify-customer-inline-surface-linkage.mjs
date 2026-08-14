#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow","dispatch"],"cols":["customer"],"leafRe":"^(cash-flow\\.panel\\.projection|dispatch\\.modal\\.save_load_template)$","task":"WAVE-A-CUSTOMER-INLINE-SURFACES"} */
import fs from "node:fs";
const read = (p) => fs.readFileSync(p, "utf8");
const files = {
  ui: read("apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx"),
  route: read("apps/backend/src/forecast/cash-forecast-manual.routes.ts"),
  template: read("apps/backend/src/dispatch/dispatch-refinements.service.ts"),
};
function failures(s) {
  return [
    ["customer picker", s.ui.includes('kind="customer" operatingCompanyId={operatingCompanyId}')],
    ["customer payload", s.ui.includes('direction === "income" && form.party_ref_id ? "customer"')],
    ["customer drill", s.ui.includes('e.party_ref_kind === "driver" || e.party_ref_kind === "customer"')],
    ["forecast customer scope", /FROM mdata\.customers WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(s.route)],
    ["template customer scope", /template_json\.customer_id[\s\S]*FROM mdata\.customers WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(s.template)],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const broken = { ...files, template: files.template.replaceAll("operating_company_id = $2::uuid", "TRUE") };
  if (!failures(broken).includes("template customer scope")) process.exit(1);
  console.log("verify-customer-inline-surface-linkage selftest PASS — template scope mutation red");
}
const missing = failures(files);
if (missing.length) { console.error(`verify-customer-inline-surface-linkage FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-customer-inline-surface-linkage PASS — customer picker/payload/scope/reload + template ownership");
