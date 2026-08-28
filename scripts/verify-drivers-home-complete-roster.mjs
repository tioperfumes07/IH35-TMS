#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["driver","connectivity","reverse_link","qbo_chrome"],"leaves":["home.roster"],"task":"DRV-F6921-DRIVERS-HOME-COMPLETE-ROSTER","vertical":"class-sweep"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "apps/frontend/src/pages/Drivers.tsx");

function verify(source) {
  const checks = [
    ["exhaustive helper imported", /\blistAllDrivers,/.test(source)],
    ["home roster exhausts canonical driver range", /const driversQuery = useQuery\([\s\S]*?listAllDrivers\(\{[\s\S]*?operating_company_id:\s*selectedCompanyId[\s\S]*?status:\s*"All"[\s\S]*?search,/.test(source)],
    ["home roster has no page cap", !/const driversQuery = useQuery\([\s\S]*?listDrivers\(\{[\s\S]*?limit:\s*200/.test(source)],
    ["status-tab counts use exhausted rows", /const allDrivers = useMemo\(\(\) => driversQuery\.data \?\? \[\]/.test(source) && /driverListTabCounts = useMemo/.test(source)],
    ["new-driver KPI uses exhausted rows", /newDriversInLast3Days = useMemo\([\s\S]*?allDrivers\.filter/.test(source)],
    ["read failure remains visible and retryable", /driversQuery\.isError[\s\S]*?driversQuery\.refetch\(\)/.test(source)],
    ["master rows remain rendered", /rows=\{driversRowsFiltered\}/.test(source)],
  ];
  return checks.filter(([, ok]) => !ok).map(([label]) => label);
}

const source = fs.readFileSync(pagePath, "utf8");
const failures = verify(source);
if (failures.length) {
  console.error(`verify-drivers-home-complete-roster FAILED: ${failures.join("; ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["first page", source.replace("listAllDrivers({", "listDrivers({\n        limit: 200,")],
    ["cross-company", source.replace("operating_company_id: selectedCompanyId", "operating_company_id: undefined")],
    ["status narrowed", source.replace('status: "All"', 'status: "Active"')],
    ["search disconnected", source.replace("        search,\n      }).then", "        search: undefined,\n      }).then")],
    ["failure hidden", source.replace("driversQuery.isError", "false")],
  ];
  for (const [label, mutation] of mutations) {
    if (verify(mutation).length === 0) {
      console.error(`verify-drivers-home-complete-roster SELFTEST FAILED: mutation survived: ${label}`);
      process.exit(1);
    }
  }
  console.log(`verify-drivers-home-complete-roster SELFTEST PASS — ${mutations.length} planted defects rejected`);
}

console.log("verify-drivers-home-complete-roster PASS — /drivers tabs, KPIs, and master rows derive from the full scoped canonical driver roster");
