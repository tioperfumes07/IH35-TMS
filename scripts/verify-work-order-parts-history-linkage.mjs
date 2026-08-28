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
  if (!/getPartsAssignmentsPage\(operatingCompanyId, \{[\s\S]{0,180}work_order_id: workOrderId,[\s\S]{0,180}limit: partsPageSize,[\s\S]{0,180}offset: partsPage \* partsPageSize/.test(s.modal)) failures.push("WO modal must request exact paged reverse set");
  if (/\.filter\(\(row\) => row\.work_order_id === workOrderId\)/.test(s.modal)) failures.push("WO modal must not browser-filter capped company response");
  if (!/partsLinksQuery\.isError/.test(s.modal) || !/Couldn't load parts linked to this work order/.test(s.modal) || !/partsLinksQuery\.refetch/.test(s.modal)) failures.push("WO modal must expose retryable errors");
  if (!/if \(partsLinksQuery\.isError\) setAddPartsLinkOpen\(false\)/.test(s.modal) || !/disabled=\{partsLinksQuery\.isError\}/.test(s.modal) || !/open=\{addPartsLinkOpen && !partsLinksQuery\.isError\}/.test(s.modal)) failures.push("failed reverse read must close and disable Add parts linkage");
  if (!/createPartsAssignment\(input\.workOrderId, input\.companyId/.test(s.creator)) failures.push("creator must target the submitted work order and company");
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
    ["exact read", "modal", /work_order_id: workOrderId,/, "work_order_id: undefined,"],
    ["error", "modal", /partsLinksQuery\.isError/, "false"],
    ["retry", "modal", /partsLinksQuery\.refetch/g, "Promise.resolve"],
    ["close drawer", "modal", /if \(partsLinksQuery\.isError\) setAddPartsLinkOpen\(false\)/, "if (false) setAddPartsLinkOpen(false)"],
    ["disable add", "modal", /disabled=\{partsLinksQuery\.isError\}/, "disabled={false}"],
    ["drawer gate", "modal", /open=\{addPartsLinkOpen && !partsLinksQuery\.isError\}/, "open={addPartsLinkOpen}"],
    ["creator", "creator", /createPartsAssignment\(input\.workOrderId, input\.companyId/, "createPartsAssignment('', input.companyId"],
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
