#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-warranty-claim-linkage";
const files = {
  route: "apps/backend/src/maintenance/warranty.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  page: "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx",
  reverse: "apps/frontend/src/components/maintenance/WarrantyClaimsReverseSection.tsx",
  wo: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  vendor: "apps/frontend/src/pages/VendorDetail.tsx",
  entityLink: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/EntityPicker[\s\S]{0,400}kind="work_order"[\s\S]{0,400}dataField="warranty-claim-work-order"/.test(s.page)) failures.push("claim creator must use the canonical work-order picker");
  if (!/work_order_id:\s*claimDraft\.work_order_id \|\| undefined/.test(s.page)) failures.push("claim creator must submit the selected work_order_id");
  if (!/<EntityLinkOrTombstone kind="work_order" id=\{row\.work_order_id\} name=\{row\.work_order_display_id\} noun="Work order"/.test(s.page)) failures.push("claim list must use an unresolved-safe work-order drill");
  if (!/wo\.display_id AS work_order_display_id/.test(s.route)) failures.push("claim list must project the work-order display id");
  if (!/LEFT JOIN maintenance\.work_orders wo[\s\S]{0,180}wo\.operating_company_id = wc\.operating_company_id/.test(s.route)) failures.push("claim list work-order label join must be company scoped");
  if (!/work_order_display_id\?: string \| null/.test(s.api) || !/name=\{row\.work_order_display_id\}/.test(s.page)) failures.push("typed work-order display id must reach the mounted claim list");
  if (!/<EntityLinkOrTombstone kind="vendor" id=\{row\.vendor_id\} name=\{row\.vendor_name\} noun="Vendor"/.test(s.page)) failures.push("nullable vendor identity must use the unresolved-safe canonical drill");
  if (!/row\.id === highlightedClaimId/.test(s.page)) failures.push("claim list must honor warranty_claim deep links");
  if (!/AS warranty_ok/.test(s.route) || !/AS work_order_ok/.test(s.route) || !/AS vendor_ok/.test(s.route) || !/linked_entity_not_in_operating_company/.test(s.route)) failures.push("claim writer must validate warranty/work-order/vendor before insert");
  if (!/if \(body\.vendor_id\)[\s\S]{0,500}FROM mdata\.vendors[\s\S]{0,250}operating_company_id = \$2::uuid[\s\S]{0,180}deactivated_at IS NULL[\s\S]{0,250}invalid_vendor/.test(s.route)) failures.push("claim update must validate an active tenant vendor before replacing vendor_id");
  if (!/outcome\.kind === "invalid_vendor"[\s\S]{0,180}reply\.code\(400\)[\s\S]{0,120}linked_entity_not_in_operating_company/.test(s.route)) failures.push("invalid update vendor must return an honest 400");
  if (!/filters\.push\(`wc\.vendor_id = \$\$\{values\.length\}`\)/.test(s.route)) failures.push("claim list must filter vendor_id in SQL");
  if (!/params\.vendor_id\) q\.set\("vendor_id", params\.vendor_id\)/.test(s.api)) failures.push("client must forward vendor_id reverse filter");
  if (!/listMaintenanceWarrantyClaims\(operatingCompanyId, filter\)/.test(s.reverse) || !/ListErrorBanner/.test(s.reverse)) failures.push("shared reverse section must read exact filters and show failures");
  if (!/<WarrantyClaimsReverseSection[\s\S]{0,260}filter=\{\{ work_order_id: id \}\}/.test(s.wo)) failures.push("work-order detail must mount warranty reverse section");
  if (!/<WarrantyClaimsReverseSection[\s\S]{0,260}filter=\{\{ vendor_id: vendor\.id \}\}/.test(s.vendor)) failures.push("vendor profile must mount warranty reverse section");
  if (!/case "warranty_claim":[\s\S]{0,100}warranty-claims\?claim_id=/.test(s.entityLink)) failures.push("warranty_claim must resolve to the canonical highlighted list target");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "page", /kind="work_order"/, 'kind="unit"'],
    ["payload", "page", /work_order_id:\s*claimDraft\.work_order_id \|\| undefined/, "work_order_id: undefined"],
    ["WO label projection", "route", /wo\.display_id AS work_order_display_id/, "NULL AS work_order_display_id"],
    ["WO label scope", "route", /wo\.operating_company_id = wc\.operating_company_id/, "TRUE"],
    ["WO label consumer", "page", /name=\{row\.work_order_display_id\}/, "name={null}"],
    ["vendor tombstone", "page", /EntityLinkOrTombstone kind="vendor" id=\{row\.vendor_id\} name=\{row\.vendor_name\} noun="Vendor"/, 'EntityLink kind="vendor" id={row.vendor_id} label={row.vendor_name}'],
    ["writer", "route", /AS work_order_ok/, "AS wo_ok"],
    ["update writer", "route", /(if \(body\.vendor_id\)[\s\S]{0,500})operating_company_id = \$2::uuid/, "$1TRUE"],
    ["update error", "route", /outcome\.kind === "invalid_vendor"/, 'outcome.kind === "ok"'],
    ["vendor filter", "route", /filters\.push\(`wc\.vendor_id = \$\$\{values\.length\}`\)/, "void values"],
    ["api filter", "api", /q\.set\("vendor_id", params\.vendor_id\)/g, 'q.set("status", params.vendor_id)'],
    ["reverse read", "reverse", /listMaintenanceWarrantyClaims\(operatingCompanyId, filter\)/, "listMaintenanceWarrantyClaims(operatingCompanyId)"],
    ["wo mount", "wo", /WarrantyClaimsReverseSection/g, "MissingWarrantySection"],
    ["vendor mount", "vendor", /WarrantyClaimsReverseSection/g, "MissingWarrantySection"],
    ["drill", "entityLink", /case "warranty_claim":/, 'case "warranty_record":'],
    ["highlight", "page", /row\.id === highlightedClaimId/, "false"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped or was inert`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — 15 linkage mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — warranty claim picker→tenant-safe writer→vendor/work-order reverse mounts→canonical drill`);
