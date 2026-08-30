#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/backend/src/maintenance/work-orders.routes.ts";
const source = fs.readFileSync(file, "utf8");
const update = "UPDATE maintenance.work_orders SET status = $2, updated_at = now() WHERE id = $1 AND operating_company_id = $3::uuid";
const audit = "{ operating_company_id: companyId, resource_id: params.data.id, from_status: current.status, to_status: parsed.data.new_status }";
const closedRead = "SELECT closed_at::text, updated_at::text, status FROM maintenance.work_orders WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1";

function count(value, token) {
  return value.split(token).length - 1;
}

function inspect(value) {
  const failures = [];
  if (count(value, update) !== 2) failures.push("both status UPDATEs must bind company atomically");
  if (count(value, audit) !== 2) failures.push("both status-transition audits must retain company");
  if (count(value, "parsed.data.new_status,\n        companyId,") !== 2) failures.push("both status UPDATE parameter lists must bind company");
  if (count(value, closedRead) !== 2 || count(value, "[params.data.id, companyId]") < 2) failures.push("both closed follow-up reads must bind company");
  return failures;
}

const failures = inspect(source);
if (failures.length) {
  console.error(`verify-maint-work-order-status-company-scope FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [update, "UPDATE maintenance.work_orders SET status = $2, updated_at = now() WHERE id = $1"],
    [audit, "{ resource_id: params.data.id, from_status: current.status, to_status: parsed.data.new_status }"],
    [closedRead, "SELECT closed_at::text, updated_at::text, status FROM maintenance.work_orders WHERE id = $1 LIMIT 1"],
  ];
  for (const [before, after] of mutations) {
    const mutant = source.replace(before, after);
    if (inspect(mutant).length === 0) throw new Error(`selftest missed ${before}`);
  }
  console.log(`verify-maint-work-order-status-company-scope --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-maint-work-order-status-company-scope PASS — both status writers, audits, and close read bind company");
