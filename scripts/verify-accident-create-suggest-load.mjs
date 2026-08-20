#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-accident-create-suggest-load";
const REL = "apps/frontend/src/components/safety/AccidentReportDrawer.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  if (!/suggestExpenseLoad/.test(body)) failures.push("accident creator must use the canonical active-load resolver");
  const request = body.match(/suggestExpenseLoad\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  if (!/operating_company_id:\s*operatingCompanyId/.test(request)) failures.push("suggestion read must be entity scoped");
  for (const field of ["driver_id: driverId", "unit_id: unitId", "transaction_date: incidentDate"]) {
    if (!request.includes(field)) failures.push(`suggestion request missing ${field}`);
  }
  if (!body.includes("enabled: open && createMode && Boolean(operatingCompanyId && incidentDate && (driverId || unitId || trailerId))")) {
    failures.push("suggest-load must be create-only and require company, date, and a driver/unit/trailer anchor");
  }
  if (!/if \(loadId \|\| suggestionPinned\) return/.test(body)) failures.push("resolver must not overwrite an operator-selected load");
  if (!/setLoadId\(suggested\.load_id\)/.test(body)) failures.push("suggested load id must reach the controlled create payload state");
  if (!/load_id:\s*loadId \|\| null/.test(body)) failures.push("create/save payload must still forward load_id");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operating_company_id: operatingCompanyId", "operating_company_id: undefined"],
    ["unit_id: unitId", "unit_id: undefined"],
    ["if (loadId || suggestionPinned) return", "if (suggestionPinned) return"],
    ["setLoadId(suggested.load_id)", "void suggested.load_id"],
    ["enabled: open && createMode && Boolean(operatingCompanyId && incidentDate && (driverId || unitId || trailerId))", "enabled: open && Boolean(operatingCompanyId)"],
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
  console.log(`${LABEL} SELFTEST PASS — scope, unit, override, stamp, and createMode mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — accident create resolves and stamps the active load without overriding operators`);
