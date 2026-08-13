#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-internal-fine-create-suggest-load";
const REL = "apps/frontend/src/pages/safety/InternalFinesPage.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  if (!/suggestExpenseLoad/.test(body)) failures.push("internal-fine creator must use the canonical active-load resolver");
  const request = body.match(/suggestExpenseLoad\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  if (!/operating_company_id:\s*operatingCompanyId/.test(request)) failures.push("suggestion read must be entity scoped");
  if (!/driver_id:\s*form\.driver_uuid/.test(request)) failures.push("suggestion request must forward the selected driver");
  if (!/transaction_date:\s*form\.imposed_date/.test(request)) failures.push("suggestion request must forward the imposed date");
  if (!/if \(form\.related_load_uuid \|\| suggestionPinned\) return/.test(body)) failures.push("resolver must not overwrite an operator-selected load");
  if (!/related_load_uuid:\s*suggested\.load_id/.test(body)) failures.push("suggested load id must reach controlled create state");
  if (!/body\.related_load_uuid = form\.related_load_uuid/.test(body)) failures.push("create payload must forward related_load_uuid");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operating_company_id: operatingCompanyId", "operating_company_id: undefined"],
    ["driver_id: form.driver_uuid", "driver_id: undefined"],
    ["if (form.related_load_uuid || suggestionPinned) return", "if (suggestionPinned) return"],
    ["related_load_uuid: suggested.load_id", "notes: suggested.load_id"],
  ];
  for (const [from, to] of mutations) {
    const requestStart = source.indexOf("suggestExpenseLoad({");
    const changed = source.slice(0, requestStart) + source.slice(requestStart).replace(from, to);
    if (changed === source || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — scope, driver, override, and stamp mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — internal-fine create resolves and stamps the active load without overriding operators`);
