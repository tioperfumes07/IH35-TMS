#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "verify-abandonment-driver-picker";
const REL = "apps/frontend/src/pages/loads/AbandonmentReportModal.tsx";
const source = fs.readFileSync(REL, "utf8");

function audit(body) {
  const failures = [];
  if (!/DriverPickerWithCreate/.test(body)) failures.push("abandonment creator must use the canonical driver picker");
  const picker = body.match(/<DriverPickerWithCreate([\s\S]*?)\/>/)?.[1] ?? "";
  if (!/operatingCompanyId=\{operatingCompanyId\}/.test(picker)) failures.push("driver picker must be company scoped");
  if (!/value=\{driverId \|\| null\}/.test(picker)) failures.push("picker must control the submitted driver state");
  if (!/setDriverId\(next \?\? ""\)/.test(picker)) failures.push("picker selection must update submitted driver state");
  if (/Driver ID \(uuid\)/.test(body)) failures.push("raw UUID driver control must not remain");
  if (!/driver_id:\s*driverId\.trim\(\)/.test(body)) failures.push("abandonment payload must forward the selected driver FK");
  if (!/recordLoadAbandonment\(loadId, operatingCompanyId/.test(body)) failures.push("load and company scope must remain on create");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["operatingCompanyId={operatingCompanyId}", "operatingCompanyId={undefined}"],
    ["value={driverId || null}", "value={null}"],
    ["setDriverId(next ?? \"\")", "void next"],
    ["driver_id: driverId.trim()", "driver_id: \"\""],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || audit(changed).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — scope, control, selection, and payload mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — load-abandonment create uses a scoped canonical driver picker and forwards its FK`);
