#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pageFile = path.join(repoRoot, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const source = fs.readFileSync(pageFile, "utf8");
const apiSource = fs.readFileSync(path.join(repoRoot, "apps/frontend/src/api/mdata.ts"), "utf8");

export function audit(src, api = apiSource) {
  const failures = [];
  const listUnits = api.slice(api.indexOf("export function listUnits("), api.indexOf("export async function listAllUnits("));
  if (!/import \{ listAllUnits \} from "\.\.\/\.\.\/api\/mdata"/.test(src)) failures.push("fleet page must import canonical complete unit reader");
  if ((src.match(/await listAllUnits\(/g) || []).length < 2) failures.push("both fleet queries must use the complete reader");
  if ((src.match(/include: "trailers"/g) || []).length < 2) failures.push("both fleet queries must include trailer rows");
  if ((src.match(/operating_company_id: operatingCompanyId/g) || []).length < 2) failures.push("both fleet queries must carry selected company scope");
  if (!/type: typeFilter \|\| undefined/.test(src) || !/include_inactive: includeInactive/.test(src)) failures.push("filtered fleet query must forward type and lifecycle filters");
  if (!/if \(params\.include\) query\.set\("include", params\.include\)/.test(listUnits)) failures.push("canonical listUnits must serialize include=trailers");
  if (!/if \(params\.operating_company_id\) query\.set\("operating_company_id", params\.operating_company_id\)/.test(listUnits)) failures.push("canonical listUnits must serialize selected company");
  if (!/export async function listAllUnits/.test(api) || !/if \(offset \+ page\.units\.length >= expectedTotal\)/.test(api)) failures.push("canonical reader must exhaust the stable server total");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [source.replaceAll("await listAllUnits(", "await listUnits("), apiSource],
    [source.replaceAll('include: "trailers"', 'include: undefined'), apiSource],
    [source.replace("operating_company_id: operatingCompanyId", "operating_company_id: undefined"), apiSource],
    [source.replace("type: typeFilter || undefined", "type: undefined"), apiSource],
    [source, apiSource.replaceAll('query.set("include", params.include)', 'query.set("status", params.include)')],
    [source, apiSource.replaceAll('query.set("operating_company_id", params.operating_company_id)', 'query.set("company", params.operating_company_id)')],
    [source, apiSource.replace("export async function listAllUnits", "async function hiddenListAllUnits")],
  ];
  for (const [index, [mutatedPage, mutatedApi]] of mutations.entries()) {
    if ((mutatedPage === source && mutatedApi === apiSource) || audit(mutatedPage, mutatedApi).length === 0) {
      console.error(`[verify-fleet-unified-includes-trailers] selftest mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }
  console.log(`[verify-fleet-unified-includes-trailers] SELFTEST PASS (${mutations.length}/${mutations.length})`);
}

const failures = audit(source);
if (failures.length) {
  console.error(`[verify-fleet-unified-includes-trailers] FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

console.log("[verify-fleet-unified-includes-trailers] OK");
