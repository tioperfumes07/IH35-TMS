#!/usr/bin/env node
import { readFileSync } from "node:fs";

const FILE = "apps/backend/src/dispatch/loads-bulk.routes.ts";
const source = readFileSync(FILE, "utf8");

function verify(src = source) {
  const failures = [];
  const start = src.indexOf("async function handleLoadBulk");
  const end = src.indexOf("export async function registerLoadsBulkRoutes", start);
  const handler = start >= 0 && end > start ? src.slice(start, end) : "";
  const preRead = handler.match(/SELECT \*[\s\S]*?FROM mdata\.loads[\s\S]*?FOR UPDATE/)?.[0] ?? "";
  if (!preRead) failures.push("bulk load lifecycle pre-read must lock the canonical row");
  if (!/id = \$1::uuid[\s\S]*operating_company_id = \$2::uuid[\s\S]*soft_deleted_at IS NULL/.test(preRead)) {
    failures.push("bulk row lock must retain exact load, company, and live-row scope");
  }
  if (!/validateLoadStatusTransition\(String\(oldRow\.status\)/.test(handler)) {
    failures.push("status transition must validate the locked snapshot");
  }
  if (!/latchOnDeliveryEvidence\(client,[\s\S]*pingSettlementOnLoadEvent\(client/.test(handler)) {
    failures.push("delivery side effects must remain downstream of the locked transition");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("      FOR UPDATE\n", ""),
    source.replace("AND operating_company_id = $2::uuid", "AND operating_company_id IS NOT NULL"),
    source.replace("AND soft_deleted_at IS NULL", "AND soft_deleted_at IS NOT NULL"),
    source.replace("validateLoadStatusTransition(String(oldRow.status)", "validateLoadStatusTransition('draft'"),
    source.replace("latchOnDeliveryEvidence(client,", "latchOnDeliveryEvidence(otherClient,"),
  ];
  mutations.forEach((mutation, index) => {
    if (mutation === source || verify(mutation).length === 0) throw new Error(`selftest mutation escaped: ${index + 1}`);
  });
  console.log("verify-loads-bulk-transition-row-lock SELFTEST PASS (5/5)");
}

const failures = verify();
if (failures.length) {
  console.error("verify-loads-bulk-transition-row-lock FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("verify-loads-bulk-transition-row-lock PASS");
