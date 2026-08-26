#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const source = fs.readFileSync(target, "utf8");

function failures(candidate) {
  const errors = [];
  const resetBlock = candidate.match(/useEffect\(\(\) => \{\s*if \(!open\) return;\s*const nextSource[\s\S]*?setCreatedExpense\(null\);\s*\}, \[[^\]]+\]\);/)?.[0] ?? "";
  if (!resetBlock) errors.push("canonical create reset effect missing");
  if (!resetBlock.includes("...form.formState.defaultValues")) errors.push("open reset must start from immutable form defaults");
  if (resetBlock.includes("form.getValues()")) errors.push("open reset must not retain prior draft values");
  if (!resetBlock.includes("operatingCompanyId")) errors.push("selected-company change must trigger reset");
  for (const field of ["unit_id", "equipment_id", "driver_id", "vendor_id", "customer_id", "load_id"]) {
    if (!new RegExp(`${field}: ""`).test(candidate)) errors.push(`default values must clear ${field}`);
    if (!new RegExp(`${field}: values\\.${field}`).test(candidate)) errors.push(`submit payload lost ${field}`);
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("...form.formState.defaultValues", "...form.getValues()"),
    source.replace(", open, operatingCompanyId]", ", open]"),
  ];
  const caught = mutations.filter((candidate) => failures(candidate).length).length;
  if (caught !== mutations.length) {
    console.error(`FAIL: caught ${caught}/${mutations.length} planted stale Work Order FK defects`);
    process.exit(1);
  }
  console.log(`PASS: ${caught}/${mutations.length} planted stale Work Order FK defects caught`);
}

const errors = failures(source);
if (errors.length) {
  console.error(errors.map((error) => `FAIL: ${error}`).join("\n"));
  process.exit(1);
}
console.log("PASS: Create Work Order resets from immutable defaults on open/company change and preserves canonical FK submits");
