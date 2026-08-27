#!/usr/bin/env node
import fs from "node:fs";
const source = fs.readFileSync("apps/backend/src/maintenance/work-orders.routes.ts", "utf8");
function block(text) {
  const start = text.indexOf('app.post("/api/v1/maintenance/work-orders/:id/status"');
  const end = text.indexOf('app.post("/api/v1/maintenance/work-orders/:id/line-items"', start);
  return text.slice(start, end);
}
function verify(text) {
  const b = block(text); const failures = [];
  if (!/if \(CLOSED_STATUSES\.has\(parsed\.data\.new_status\)\)[\s\S]*"maintenance\.work_order\.closed"/.test(b)) failures.push("alternate status route must append closed audit");
  if (!/if \(CLOSED_STATUSES\.has\(parsed\.data\.new_status\)\)[\s\S]*await processMaintenanceWorkOrderClose\(\{[\s\S]*work_order_id: params\.data\.id/.test(b)) failures.push("alternate status route must invoke canonical close service");
  if (!/if \("conflict" in result\) return reply\.code\(409\)/.test(b)) failures.push("close parity must retain source-state CAS conflict");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const b = block(source);
  const mutations = [
    source.replace(b, b.replace('"maintenance.work_order.closed"', '"maintenance.work_order.status_transition"')),
    source.replace(b, b.replace("await processMaintenanceWorkOrderClose({", "void Promise.resolve({")),
    source.replace(b, b.replace("return reply.code(409)", "return reply.code(200)")),
  ];
  const escaped = mutations.flatMap((text, index) => verify(text).length === 0 ? [index + 1] : []);
  if (escaped.length) { console.error(`SELFTEST FAIL: mutation(s) ${escaped.join(", ")} escaped`); process.exit(1); }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted defects rejected`); process.exit(0);
}
if (failures.length) { failures.forEach((f) => console.error(`FAIL: ${f}`)); process.exit(1); }
console.log("PASS: alternate WO status route preserves canonical close pipeline");
