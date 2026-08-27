#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/backend/src/maintenance/pm-schedule.routes.ts", "utf8");
function block(text) {
  const start = text.indexOf('app.post("/api/v1/maintenance/pm-schedule/:id/generate-wo"');
  return text.slice(start);
}
function verify(text) {
  const b = block(text);
  const failures = [];
  if (!/pg_advisory_xact_lock\(hashtextextended\(\$1::text, 0\)\)/.test(b)) failures.push("generate must serialize per schedule");
  if (!/origin = 'pm_schedule'[\s\S]*description ILIKE \$3/.test(b)) failures.push("dedupe must match the exact schedule-owned open WO");
  if (!/maintenance\.next_wo_display_id\(\$1::uuid, 'PM', CURRENT_DATE, \$2::uuid\)/.test(b)) failures.push("generate must mint canonical PM display identity");
  if (!/INSERT INTO maintenance\.work_orders[\s\S]*'pm'[\s\S]*'IS'[\s\S]*'open'[\s\S]*'pm_schedule'[\s\S]*RETURNING id::text, display_id/.test(b)) failures.push("generate must insert a real company PM work order");
  if (!/if \(!created\) throw new Error\("pm_work_order_create_returned_no_row"\);[\s\S]*generated_work_order_id: created\.id/.test(b)) failures.push("audit must require the returned canonical WO identity");
  if (/\?\.id \?\? "pending"|work_order_id:\s*"pending"/.test(b)) failures.push("generate must never return/audit a placeholder identity");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const b = block(source);
  const mutations = [
    source.replace(b, b.replace("await client.query(`SELECT pg_advisory_xact_lock", "await client.query(`SELECT")),
    source.replace(b, b.replace("AND origin = 'pm_schedule'", "AND true")),
    source.replace(b, b.replace("maintenance.next_wo_display_id", "maintenance.missing_display_id")),
    source.replace(b, b.replace("INSERT INTO maintenance.work_orders", "SELECT * FROM maintenance.work_orders")),
    source.replace(b, b.replace('if (!created) throw new Error("pm_work_order_create_returned_no_row");', "")),
    source.replace(b, b.replace("generated_work_order_id: created.id", 'generated_work_order_id: created?.id ?? "pending"')),
  ];
  const escaped = mutations.flatMap((text, index) => (verify(text).length === 0 ? [index + 1] : []));
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`); process.exit(0);
}
if (failures.length) { failures.forEach((failure) => console.error(`FAIL: ${failure}`)); process.exit(1); }
console.log("PASS: PM schedule Generate WO creates or reuses one real schedule-owned work order");
