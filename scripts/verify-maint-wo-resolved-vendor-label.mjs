#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-maint-wo-resolved-vendor-label";
const routes = fs.readFileSync("apps/backend/src/maintenance/work-orders.routes.ts", "utf8");
const table = fs.readFileSync("apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx", "utf8");
const detail = fs.readFileSync("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");

function audit(parts) {
  const failures = [];
  const selectCount = (parts.routes.match(/COALESCE\(w\.external_vendor_id, w\.vendor_id\)::text AS resolved_vendor_id/g) ?? []).length;
  const joinCount = (parts.routes.match(/v\.id = COALESCE\(w\.external_vendor_id, w\.vendor_id\) AND v\.operating_company_id = w\.operating_company_id/g) ?? []).length;
  if (selectCount < 2) failures.push("list and detail payloads must expose the resolved vendor FK");
  if (joinCount < 2) failures.push("list and detail vendor joins must resolve both FK columns with entity scope");
  if (!/resolved_vendor_name\?: string \| null/.test(parts.api)) failures.push("WorkOrder API type must expose resolved vendor label");
  const tableLabelCount = (parts.table.match(/entityLabel\(row\.resolved_vendor_name, row\.resolved_vendor_id, "Vendor"\)/g) ?? []).length
    + (parts.table.includes("name={row.resolved_vendor_name}") ? 1 : 0);
  if (tableLabelCount < 2 || !/row\.resolved_vendor_id/.test(parts.table)) failures.push("WO list and export must carry the resolved vendor FK and label");
  if (!/<EntityLinkOrTombstone\s+kind="vendor"\s+id=\{wo\.resolved_vendor_id as string \| null\}\s+name=\{wo\.resolved_vendor_name\}\s+noun="Vendor"/.test(parts.detail)) failures.push("WO detail must link the resolved vendor FK and label");
  return failures;
}

const parts = { routes, table, detail, api };
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["routes", "COALESCE(w.external_vendor_id, w.vendor_id)::text AS resolved_vendor_id", "w.external_vendor_id::text AS resolved_vendor_id"],
    ["routes", "AND v.operating_company_id = w.operating_company_id", ""],
    ["table", "name={row.resolved_vendor_name}", "name={null}"],
    ["detail", "name={wo.resolved_vendor_name}", "name={null}"],
  ];
  for (const [key, from, to] of mutations) {
    const changed = { ...parts, [key]: parts[key].replace(from, to) };
    if (changed[key] === parts[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — fallback FK, entity scope, list label, and detail label mutations detected`);
  process.exit(0);
}

const failures = audit(parts);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — WO list/detail resolve canonical vendor labels from external_vendor_id or vendor_id`);
