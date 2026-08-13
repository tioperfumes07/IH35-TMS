#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-driver-fuel-unit-picker";
const REL = "apps/frontend/src/pages/driver/FuelReceiptPage.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  if (!/queryFn:\s*listDriverFuelUnits/.test(body)) failures.push("fuel receipt must read the driver-scoped unit roster");
  const picker = body.match(/<Combobox([\s\S]*?)\/>/)?.[1] ?? "";
  if (!/options=\{unitOptions\}/.test(picker)) failures.push("unit roster must feed the picker");
  if (!/value=\{truckId \|\| null\}/.test(picker)) failures.push("picker must control submitted truck state");
  if (!/setTruckId\(next \?\? ""\)/.test(picker)) failures.push("picker selection must update submitted truck state");
  if (!/clearCommittedOnEdit/.test(picker)) failures.push("editing a committed label must clear the FK");
  if (/Truck \(unit\) ID/.test(body)) failures.push("raw unit-id control must not remain");
  if (!/fd\.set\("truck_id", truckId\)/.test(body)) failures.push("upload must forward the selected unit FK");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["queryFn: listDriverFuelUnits", "queryFn: async () => ({ units: [] })"],
    ["options={unitOptions}", "options={[]}"],
    ["setTruckId(next ?? \"\")", "void next"],
    ["fd.set(\"truck_id\", truckId)", "fd.set(\"truck_id\", \"\")"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — roster, options, selection, and upload mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — driver fuel receipt reads the scoped unit roster and submits the selected unit FK`);
