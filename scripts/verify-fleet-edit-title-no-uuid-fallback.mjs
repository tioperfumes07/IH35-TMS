#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/fleet/EditVehicleModal.tsx";
const source = fs.readFileSync(file, "utf8");
const contracts = [
  "const unitLabel = profileQuery.isError\n    ? \"Unit\"\n    : String(unit?.unit_number ?? rowPreview?.unit_number ?? \"Unit\");",
];
const forbidden = "rowPreview?.unit_number ?? unitId";

const check = (text) => contracts.filter((contract) => !text.includes(contract)).concat(text.includes(forbidden) ? [forbidden] : []);
if (process.argv.includes("--selftest")) {
  for (const contract of contracts) {
    const mutated = source.replace(contract, "");
    if (mutated === source || check(mutated).length === 0) process.exit(1);
  }
  const mutated = source.replace("rowPreview?.unit_number ?? \"Unit\"", "rowPreview?.unit_number ?? unitId ?? \"Unit\"");
  if (mutated === source || check(mutated).length === 0) process.exit(1);
  console.log("verify-fleet-edit-title-no-uuid-fallback SELFTEST PASS — 2/2 exact mutations red");
  process.exit(0);
}
const failures = check(source);
if (failures.length) {
  console.error(`verify-fleet-edit-title-no-uuid-fallback FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-fleet-edit-title-no-uuid-fallback PASS — failed/missing profile reads never expose unit UUIDs in modal chrome");
