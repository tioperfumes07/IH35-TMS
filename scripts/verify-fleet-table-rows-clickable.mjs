#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const targetFile = path.join(repoRoot, "apps/frontend/src/components/FleetTable.tsx");
const source = fs.readFileSync(targetFile, "utf8");

export function audit(src) {
  const failures = [];
  if (!/function fleetProfilePath\(row: FleetRow\): string/.test(src)) {
    failures.push("missing fleetProfilePath helper for kind-based navigation");
  }
  if (!src.includes("/fleet/units/")) failures.push("missing canonical unit profile route");
  if (!src.includes("/fleet/trailers/")) failures.push("missing canonical trailer profile route");
  const trOnClickPattern = /<tr[\s\S]*?onClick=\{\(\)\s*=>\s*navigate\(fleetProfilePath\(row\)\)\}[\s\S]*?>/m;
  if (!trOnClickPattern.test(src)) failures.push("navigate call is not wired on <tr> onClick path");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("function fleetProfilePath(row: FleetRow): string", "function removedFleetProfilePath(row: FleetRow): string"),
    source.replace("/fleet/units/", "/fleet/unit-missing/"),
    source.replace("/fleet/trailers/", "/fleet/trailer-missing/"),
    source.replace("onClick={() => navigate(fleetProfilePath(row))}", "onClick={() => undefined}"),
  ];
  for (const [index, mutated] of mutations.entries()) {
    if (mutated === source || audit(mutated).length === 0) {
      console.error(`[verify-fleet-table-rows-clickable] selftest mutation ${index + 1} escaped`);
      process.exit(1);
    }
  }
  console.log(`[verify-fleet-table-rows-clickable] SELFTEST PASS (${mutations.length}/${mutations.length})`);
}

const failures = audit(source);
if (failures.length) {
  console.error(`[verify-fleet-table-rows-clickable] FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("[verify-fleet-table-rows-clickable] OK");
