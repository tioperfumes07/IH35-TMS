#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx";
const source = fs.readFileSync(target, "utf8");

function failures(candidate) {
  const errors = [];
  if (!/const resetDraft = useCallback\(\(\) => \{[\s\S]*?setSuggestionPinned\(false\);\s*\}, \[\]\);/.test(candidate) ||
      !/useEffect\(\(\) => \{\s*lifecycleGenerationRef\.current \+= 1;\s*setSaving\(false\);\s*if \(!open\) return;\s*resetDraft\(\);\s*\}, \[open, operatingCompanyId, resetDraft\]\);/.test(candidate)) {
    errors.push("full Fuel draft reset must depend on open and operatingCompanyId");
  }
  for (const setter of ["setDriverId", "setUnitId", "setTrailerId", "setVendorId", "setLoadId"]) {
    if (!candidate.includes(`${setter}("");`)) errors.push(`company reset lost ${setter}`);
  }
  for (const field of ["driver_id", "unit_id", "trailer_id", "vendor_id", "load_id"]) {
    if (!candidate.includes(`${field}: ${field.replace("_id", "Id")} || null`)) {
      errors.push(`submit payload lost ${field}`);
    }
  }
  if (!candidate.includes("load_exemption_reason: loadId ? undefined : loadExemptionReason.trim()")) {
    errors.push("G18 load exemption behavior must remain wired");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("}, [open, operatingCompanyId, resetDraft]);", "}, [open, resetDraft]);"),
    source.replace('setTrailerId("");', "// planted stale trailer"),
  ];
  const caught = mutations.filter((candidate) => failures(candidate).length).length;
  if (caught !== mutations.length) {
    console.error(`FAIL: caught ${caught}/${mutations.length} planted cross-company Fuel creator defects`);
    process.exit(1);
  }
  console.log(`PASS: ${caught}/${mutations.length} planted cross-company Fuel creator defects caught`);
}

const errors = failures(source);
if (errors.length) {
  console.error(errors.map((error) => `FAIL: ${error}`).join("\n"));
  process.exit(1);
}
console.log("PASS: Fuel create clears all selected FKs when the operating company changes and preserves canonical payloads");
