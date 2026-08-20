#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-work-order-parts-history-linkage";
const files = {
  route: "apps/backend/src/maintenance/parts-invoice-links.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  modal: "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx",
  creator: "apps/frontend/src/components/maintenance/AddPartsLinkDrawer.tsx",
  link: "apps/frontend/src/components/shared/EntityLink.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function audit(s) {
  const failures = [];
  if (!/work_order_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(s.route) || !/pil\.work_order_id = \$\$\{values\.length\}::uuid/.test(s.route)) failures.push("list route must apply exact work-order predicate");
  if (!/function listPartsAssignments[\s\S]{0,180}work_order_id\?: string/.test(s.api) || !/query\.set\("work_order_id", filters\.work_order_id\)/.test(s.api)) failures.push("client must forward work-order filter");
  if (!/listPartsAssignments\(operatingCompanyId, \{ work_order_id: workOrderId \}\)/.test(s.modal)) failures.push("WO modal must request exact reverse set");
  if (/\.filter\(\(row\) => row\.work_order_id === workOrderId\)/.test(s.modal)) failures.push("WO modal must not browser-filter capped company response");
  if (!/partsLinksQuery\.isError/.test(s.modal) || !/Couldn't load parts linked to this work order/.test(s.modal) || !/partsLinksQuery\.refetch/.test(s.modal)) failures.push("WO modal must expose retryable errors");
  if (!/createPartsAssignment\(workOrderId, operatingCompanyId/.test(s.creator)) failures.push("creator must target active work order");
  if (!/kind="vendor"[\s\S]{0,100}link\.vendor_id/.test(s.modal)) failures.push("reverse rows must drill to canonical vendor");
  if (!/case "vendor":[\s\S]{0,50}`\/vendors\/\$\{id\}`/.test(s.link)) failures.push("vendor route must be canonical");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["schema", "route", /work_order_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/, ""],
    ["filter", "route", /pil\.work_order_id = \$\$\{values\.length\}::uuid/, "TRUE"],
    ["api type", "api", /(function listPartsAssignments[\s\S]{0,180})work_order_id\?: string/, "$1work_order_id: never"],
    ["api forwarding", "api", /query\.set\("work_order_id", filters\.work_order_id\)/, 'query.set("status", filters.work_order_id)'],
    ["exact read", "modal", /listPartsAssignments\(operatingCompanyId, \{ work_order_id: workOrderId \}\)/, "listPartsAssignments(operatingCompanyId)"],
    ["error", "modal", /partsLinksQuery\.isError/, "false"],
    ["retry", "modal", /partsLinksQuery\.refetch/g, "Promise.resolve"],
    ["creator", "creator", /createPartsAssignment\(workOrderId, operatingCompanyId/, "createPartsAssignment('', operatingCompanyId"],
    ["vendor drill", "modal", /kind="vendor"/g, 'kind="customer"'],
    ["vendor route", "link", /case "vendor":/, 'case "vendor_missing":'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} mutation escaped or was inert`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} linkage mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — WO-targeted parts create→exact reverse set→vendor drill with honest states`);
