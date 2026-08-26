#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-safety-event-create-suggest-load";
const REL = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  const request = body.match(/suggestExpenseLoad\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  if (!/operating_company_id:\s*operatingCompanyId/.test(request)) failures.push("resolver must be entity scoped");
  if (!/driver_id:\s*draft\.subject_driver_id/.test(request)) failures.push("resolver must receive subject driver");
  if (!/unit_id:\s*draft\.subject_unit_id/.test(request)) failures.push("resolver must receive subject unit");
  if (!/transaction_date:\s*draft\.occurred_at\.slice\(0, 10\)/.test(request)) failures.push("resolver must receive event date");
  if (!/if \(draft\.related_load_id \|\| suggestionPinned\) return/.test(body)) failures.push("operator-selected load must win");
  if (!/related_load_id:\s*suggested\.load_id/.test(body)) failures.push("suggested load must reach draft state");
  if (!/related_load_id:\s*input\.draft\.related_load_id\.trim\(\) \|\| undefined/.test(body)) failures.push("create payload must forward snapshotted load FK");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operating_company_id: operatingCompanyId", "operating_company_id: undefined"],
    ["unit_id: draft.subject_unit_id", "unit_id: undefined"],
    ["if (draft.related_load_id || suggestionPinned) return", "if (suggestionPinned) return"],
    ["related_load_id: suggested.load_id", "description: suggested.load_id"],
    ["related_load_id: input.draft.related_load_id.trim() || undefined", "related_load_id: undefined"],
  ];
  for (const [from, to] of mutations) {
    const start = source.indexOf("suggestExpenseLoad({");
    const changed = source.slice(0, start) + source.slice(start).replace(from, to);
    if (changed === source || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — scope, unit, override, and stamp mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — safety-event create resolves and stamps its active load without overriding operators`);
