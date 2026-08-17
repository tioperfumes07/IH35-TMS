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
  return errors;
}

function selftest() {
  const bad = `rc.name AS related_customer_name`;
  const good = `
    app.get("/api/v1/mdata/dispatcher-safety-events", ...)
    rc.customer_name AS related_customer_name
    rc.customer_name AS related_customer_name
  `;
  if (assertSource(bad).length === 0 || assertSource(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, assertSource(good));
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
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
