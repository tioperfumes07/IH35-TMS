#!/usr/bin/env node
import fs from "node:fs";
const files = { driver: fs.readFileSync("apps/backend/src/audit/driver-events.service.ts", "utf8"), spine: fs.readFileSync("apps/backend/src/audit/spine-events.routes.ts", "utf8") };
function failures(s) {
  const errors = [];
  for (const [key, alias, company] of [["driver","driver_audit_dca","$1::uuid"],["spine","spine_driver_dca","el.operating_company_id"]]) for (const needle of [`FROM mdata.driver_company_authorizations ${alias}`, `${alias}.company_id = ${company}`, `${alias}.is_authorized = true`, `${alias}.deactivated_at IS NULL`]) if (!s[key].includes(needle)) errors.push(`${key}: missing ${needle}`);
  if (!/INNER JOIN mdata\.drivers d[\s\S]{0,120}ON d\.id = \$2::uuid[\s\S]{0,160}d\.operating_company_id = \$1::uuid[\s\S]{0,160}driver_company_authorizations driver_audit_dca/.test(s.driver)) errors.push("driver audit join must bind exact driver and selected-company authorization");
  if (!s.spine.includes("d.id = el.subject_id")) errors.push("spine subject driver FK missing");
  return errors;
}
if (process.argv.includes("--selftest")) {
  if (failures(files).length) throw new Error(`clean failed: ${failures(files).join("; ")}`);
  const mutations = [{...files,driver:files.driver.replace("d.operating_company_id = $1::uuid","d.operating_company_id IS NOT NULL")},{...files,driver:files.driver.replace("driver_audit_dca.is_authorized = true","driver_audit_dca.is_authorized = false")},{...files,driver:files.driver.replace("driver_audit_dca.deactivated_at IS NULL","driver_audit_dca.deactivated_at IS NOT NULL")},{...files,spine:files.spine.replace("spine_driver_dca.is_authorized = true","spine_driver_dca.is_authorized = false")},{...files,spine:files.spine.replace("spine_driver_dca.deactivated_at IS NULL","spine_driver_dca.deactivated_at IS NOT NULL")}];
  const escaped=mutations.filter((s)=>failures(s).length===0); if(escaped.length) throw new Error(`${escaped.length}/${mutations.length} mutations escaped`); console.log(`PASS verify-driver-audit-shared-reverse --selftest (${mutations.length}/${mutations.length})`); process.exit(0);
}
const errors=failures(files); if(errors.length){console.error(errors.join("\n"));process.exit(1)} console.log("PASS verify-driver-audit-shared-reverse");
