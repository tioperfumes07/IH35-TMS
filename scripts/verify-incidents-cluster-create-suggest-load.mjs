#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-incidents-cluster-create-suggest-load";
const REL = "apps/frontend/src/pages/safety/components/SafetyIncidentsClusterSurface.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  const request = body.match(/suggestExpenseLoad\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
  for (const [name, pattern] of [
    ["entity scope", /operating_company_id:\s*operatingCompanyId/],
    ["driver", /driver_id:\s*str\(selected\?\.driver_id\)/],
    ["unit", /unit_id:\s*str\(selected\?\.unit_id\)/],
    ["trailer", /trailer_id:\s*str\(selected\?\.trailer_id\)/],
    ["incident date", /transaction_date:\s*str\(selected\?\.incident_date\)/],
  ]) if (!pattern.test(request)) failures.push(`resolver missing ${name}`);
  if (!/if \(str\(selected\?\.load_id\) \|\| suggestionPinned\) return/.test(body)) failures.push("operator-selected load must win");
  if (!/load_id:\s*suggested\.load_id/.test(body)) failures.push("suggested load must reach draft state");
  if (!/load_id:\s*str\(selected\.load_id\) \|\| null/.test(body)) failures.push("create payload must forward load FK");
  for (const page of ["DamageReportsPage.tsx", "TrailerInterchangesPage.tsx"]) {
    const pageBody = fs.readFileSync(`apps/frontend/src/pages/safety/${page}`, "utf8");
    if (!/SafetyIncidentsClusterSurface/.test(pageBody)) failures.push(`${page} must consume the guarded shared creator`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operating_company_id: operatingCompanyId", "operating_company_id: undefined"],
    ["trailer_id: str(selected?.trailer_id)", "trailer_id: undefined"],
    ["if (str(selected?.load_id) || suggestionPinned) return", "if (suggestionPinned) return"],
    ["load_id: suggested.load_id", "description: suggested.load_id"],
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
console.log(`${LABEL} PASS — damage-report and trailer-interchange creators stamp active loads without overriding operators`);
