#!/usr/bin/env node
/**
 * verify-dispatcher-safety-events-reverse
 * LV-LOAD-DISPATCHER-SAFETY-EVENTS-REVERSE-ERROR — reverse list SQL must use
 * mdata.customers.customer_name (not rc.name) or Postgres 42703 500s every reverse read.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-dispatcher-safety-events-reverse";
const TARGET = "apps/backend/src/mdata/dispatcher-safety-events.routes.ts";

function assertSource(src) {
  const errors = [];
  if (/rc\.name\s+AS\s+related_customer_name/.test(src)) {
    errors.push("must not SELECT rc.name AS related_customer_name (column does not exist)");
  }
  if (!/rc\.customer_name\s+AS\s+related_customer_name/.test(src)) {
    errors.push("must SELECT rc.customer_name AS related_customer_name");
  }
  if ((src.match(/rc\.customer_name\s+AS\s+related_customer_name/g) ?? []).length < 2) {
    errors.push("both user-list and reverse-list queries must use rc.customer_name");
  }
  if (!src.includes("/api/v1/mdata/dispatcher-safety-events")) {
    errors.push("reverse GET route must remain mounted");
  }
  if (!/dispatcher_user_dca\.driver_id = rd\.id[\s\S]{0,160}dispatcher_user_dca\.company_id = \$2::uuid[\s\S]{0,120}dispatcher_user_dca\.is_authorized = true[\s\S]{0,120}dispatcher_user_dca\.deactivated_at IS NULL/.test(src)) {
    errors.push("user-detail event rows must preserve authorized shared-driver labels");
  }
  if (!/dispatcher_reverse_dca\.driver_id = rd\.id[\s\S]{0,160}dispatcher_reverse_dca\.company_id = \$1::uuid[\s\S]{0,120}dispatcher_reverse_dca\.is_authorized = true[\s\S]{0,120}dispatcher_reverse_dca\.deactivated_at IS NULL/.test(src)) {
    errors.push("driver reverse list must recognize active company-authorized drivers");
  }
  if (!/e\.related_driver_id = \$2 AND rd\.id IS NOT NULL/.test(src)) {
    errors.push("driver reverse filter must require the scoped driver resolver");
  }
  return errors;
}

function selftest() {
  const source = fs.readFileSync(path.join(process.cwd(), TARGET), "utf8");
  if (assertSource(source).length) {
    console.error(`${LABEL} SELFTEST FAIL baseline`, assertSource(source));
    process.exit(1);
  }
  const mutations = [
    source.replace("rc.customer_name AS related_customer_name", "rc.name AS related_customer_name"),
    source.replace("dispatcher_user_dca.is_authorized = true", "dispatcher_user_dca.is_authorized = false"),
    source.replace("dispatcher_reverse_dca.company_id = $1::uuid", "dispatcher_reverse_dca.company_id = rd.operating_company_id"),
    source.replace("dispatcher_reverse_dca.deactivated_at IS NULL", "dispatcher_reverse_dca.deactivated_at IS NOT NULL"),
    source.replace("e.related_driver_id = $2 AND rd.id IS NOT NULL", "e.related_driver_id = $2"),
  ];
  if (mutations.some((mutation) => assertSource(mutation).length === 0)) {
    console.error(`${LABEL} SELFTEST FAIL — planted shared-driver defect stayed green`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertSource(fs.readFileSync(path.join(process.cwd(), TARGET), "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — dispatcher safety reverse uses customers.customer_name`);
