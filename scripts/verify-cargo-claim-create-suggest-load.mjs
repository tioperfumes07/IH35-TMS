#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-cargo-claim-create-suggest-load";
const REL = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  const request = body.match(/suggestExpenseLoad\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  for (const contract of [
    ["entity scope", /operating_company_id:\s*operatingCompanyId/],
    ["driver", /driver_id:\s*form\.driverId/],
    ["unit", /unit_id:\s*form\.unitId/],
    ["trailer", /trailer_id:\s*form\.trailerId/],
    ["loss date", /transaction_date:\s*form\.incidentDate/],
  ]) if (!contract[1].test(request)) failures.push(`resolver missing ${contract[0]}`);
  if (!/if \(form\.loadId \|\| suggestionPinned\) return/.test(body)) failures.push("operator-selected load must win");
  if (!/loadId:\s*suggested\.load_id/.test(body)) failures.push("suggested load must reach form state");
  if (!/load_id:\s*form\.loadId \|\| null/.test(body)) failures.push("create payload must forward load FK");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operating_company_id: operatingCompanyId", "operating_company_id: undefined"],
    ["trailer_id: form.trailerId", "trailer_id: undefined"],
    ["if (form.loadId || suggestionPinned) return", "if (suggestionPinned) return"],
    ["loadId: suggested.load_id", "description: suggested.load_id"],
  ];
  for (const [from, to] of mutations) {
    const start = source.indexOf("suggestExpenseLoad({");
    const changed = source.slice(0, start) + source.slice(start).replace(from, to);
    if (changed === source || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — scope, trailer, override, and stamp mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — cargo-claim create resolves and stamps its active load without overriding operators`);
