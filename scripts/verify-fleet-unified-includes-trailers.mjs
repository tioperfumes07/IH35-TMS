#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const pageFile = path.join(repoRoot, "apps/frontend/src/pages/maintenance/FleetTablePage.tsx");
const source = fs.readFileSync(pageFile, "utf8");

export function audit(src) {
  const failures = [];
  const builder = src.match(/function buildUnitsUrl\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!builder) failures.push("missing buildUnitsUrl helper");
  if (!builder.includes("/api/v1/mdata/units?include=trailers&operating_company_id=")) {
    failures.push("buildUnitsUrl must fetch the unified units+trailers endpoint with company scope");
  }
  if (!builder.includes("encodeURIComponent(operatingCompanyId)")) failures.push("buildUnitsUrl must encode the selected company id");
  if (!/apiRequest<\{ units: UnifiedUnitRow\[\]; total\?: number \}>\(buildUnitsUrl\(operatingCompanyId, ""\)\)/.test(src)) {
    failures.push("totalRowsQuery must use buildUnitsUrl");
  }
  if (!/apiRequest<\{ units: UnifiedUnitRow\[\]; total\?: number \}>\(buildUnitsUrl\(operatingCompanyId, typeFilter, includeInactive\)\)/.test(src)) {
    failures.push("rowsQuery must use buildUnitsUrl with filters");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("function buildUnitsUrl", "function removedBuildUnitsUrl"),
    source.replace("include=trailers&", ""),
    source.replace("operating_company_id=${encodeURIComponent(operatingCompanyId)}&", ""),
    source.replace("buildUnitsUrl(operatingCompanyId, typeFilter, includeInactive)", '"/api/v1/mdata/units"'),
  ];
  for (const [index, mutated] of mutations.entries()) {
    if (mutated === source || audit(mutated).length === 0) {
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
