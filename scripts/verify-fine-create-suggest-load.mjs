#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-fine-create-suggest-load";
const REL = "apps/frontend/src/pages/safety/components/FineCreateModal.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  if (!/suggestExpenseLoad/.test(body)) failures.push("fine creator must use the canonical active-load resolver");
  const request = body.match(/suggestExpenseLoad\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  if (!/operating_company_id:\s*operatingCompanyId/.test(request)) failures.push("suggestion read must be entity scoped");
  for (const field of ["driver_id: subjectDriverId", "unit_id: relatedUnitId", "transaction_date: issuedDate"]) {
    if (!request.includes(field)) failures.push(`suggestion request missing ${field}`);
  }
  if (!/if \(relatedLoadId \|\| suggestionPinned\) return/.test(body)) failures.push("resolver must not overwrite an operator-selected load");
  if (!/setRelatedLoadId\(suggested\.load_id\)/.test(body)) failures.push("suggested load id must reach the controlled create payload state");
  if (!/related_load_id:\s*input\.relatedLoadId \|\| null/.test(body)) failures.push("createSafetyFine payload must forward the immutable submitted related_load_id");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operating_company_id: operatingCompanyId", "operating_company_id: undefined"],
    ["unit_id: relatedUnitId", "unit_id: undefined"],
    ["if (relatedLoadId || suggestionPinned) return", "if (suggestionPinned) return"],
    ["setRelatedLoadId(suggested.load_id)", "void suggested.load_id"],
    ["related_load_id: input.relatedLoadId || null", "related_load_id: null"],
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
  console.log(`${LABEL} SELFTEST PASS — scope, unit, override, and stamp mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — external fine create resolves and stamps the active load without overriding operators`);
