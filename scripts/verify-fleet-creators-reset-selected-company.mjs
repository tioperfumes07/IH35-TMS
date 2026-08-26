#!/usr/bin/env node
import fs from "node:fs";

const files = [
  "apps/frontend/src/components/fleet/CreateUnitModal.tsx",
  "apps/frontend/src/components/fleet/CreateTrailerModal.tsx",
];

function failures(overrides = new Map()) {
  const errors = [];
  for (const file of files) {
    const source = overrides.get(file) ?? fs.readFileSync(file, "utf8");
    if (!source.includes('currently_leased_to_company_id: operatingCompanyId')) {
      errors.push(`${file}: initial draft must use selected operating company`);
    }
    if (!/useEffect\(\(\) => \{\s*if \(open\) setDraft\(initialDraft\);\s*\}, \[initialDraft, open\]\);/.test(source)) {
      errors.push(`${file}: opening must reset draft from current selected-company initialDraft`);
    }
    if (!source.includes('currently_leased_to_company_id: draft.currently_leased_to_company_id || operatingCompanyId')) {
      errors.push(`${file}: submit payload must retain selected-company fallback`);
    }
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const overrides = new Map([[file, source.replace("if (open) setDraft(initialDraft);", "if (false) setDraft(initialDraft);")]]);
    if (failures(overrides).length) caught += 1;
  }
  if (caught !== files.length) {
    console.error(`FAIL: caught ${caught}/${files.length} planted stale-company creator defects`);
    process.exit(1);
  }
  console.log(`PASS: ${caught}/${files.length} planted stale-company creator defects caught`);
}

const errors = failures();
if (errors.length) {
  console.error(errors.map((error) => `FAIL: ${error}`).join("\n"));
  process.exit(1);
}
console.log("PASS: Create Unit and Create Trailer reset Leased To from the current selected company on every open");
