#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-hos-violation-create-suggest-load";
const REL = "apps/frontend/src/pages/safety/components/HosViolationCreateModal.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  if (!/suggestExpenseLoad/.test(body)) failures.push("HOS violation creator must use the canonical active-load resolver");
  const request = body.match(/suggestExpenseLoad\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  if (!/operating_company_id:\s*operatingCompanyId/.test(request)) failures.push("suggestion read must be entity scoped");
  for (const field of ["driver_id: form.driver_id", "transaction_date: occurredYmd"]) {
    if (!request.includes(field)) failures.push(`suggestion request missing ${field}`);
  }
  if (!/if \(form\.related_load_id \|\| suggestionPinned\) return/.test(body)) {
    failures.push("resolver must not overwrite an operator-selected load");
  }
  if (!/related_load_id:\s*suggested\.load_id/.test(body)) {
    failures.push("suggested load id must reach the controlled create payload state");
  }
  if (!/related_load_id:\s*form\.related_load_id\.trim\(\) \|\| null/.test(body)) {
    failures.push("createHosViolation payload must forward related_load_id");
  }
  if (!/kind=\"load\"/.test(body)) failures.push("related load EntityPicker must be present");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operating_company_id: operatingCompanyId", "operating_company_id: undefined"],
    ["driver_id: form.driver_id", "driver_id: undefined"],
    ["if (form.related_load_id || suggestionPinned) return", "if (suggestionPinned) return"],
    ["related_load_id: suggested.load_id", "related_load_id: \"\""],
    ["related_load_id: form.related_load_id.trim() || null", "related_load_id: null"],
  ];
  for (const [from, to] of mutations) {
    const requestStart = source.indexOf("suggestExpenseLoad({");
    const before = source.slice(0, requestStart);
    const after = source.slice(requestStart).replace(from, to);
    const changed = before + after;
    if (changed === source || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — scope, driver, override, stamp, and payload mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — HOS violation create resolves and stamps the active load without overriding operators`);
