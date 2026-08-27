#!/usr/bin/env node
import fs from "node:fs";
const routePath = new URL("../apps/backend/src/mdata/driver-safety-events.routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");
function verify(text) {
  const marker = 'app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id",';
  const start = text.indexOf(marker); const block = start >= 0 ? text.slice(start) : "";
  const failures = [];
  const activePredicates = block.match(/WHERE id = \$1 AND driver_id = \$2 AND voided_at IS NULL/g) ?? [];
  if (activePredicates.length < 2) failures.push("driver safety-event edit read and update must both require active state");
  if (!/const row = updateRes\.rows\[0\] \?\? null;\s*if \(!row\) return null;\s*await appendCrudAudit/m.test(block)) failures.push("edit must reject lost active-state UPDATE before audit");
  if (!/driver_id: row\.driver_id,\s*operating_company_id: opco,\s*fields:/m.test(block)) failures.push("edit audit must carry resolved operating company");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const start = source.indexOf('app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id",');
  const prefix = source.slice(0, start); const block = source.slice(start);
  const mutations = [
    prefix + block.replace("WHERE id = $1 AND driver_id = $2 AND voided_at IS NULL", "WHERE id = $1 AND driver_id = $2"),
    prefix + block.replaceAll("WHERE id = $1 AND driver_id = $2 AND voided_at IS NULL", "WHERE id = $1 AND driver_id = $2"),
    source.replace("driver_id: row.driver_id,\n          operating_company_id: opco,\n          fields:", "driver_id: row.driver_id,\n          fields:"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) { console.error(`FAIL driver safety edit immutability selftest: ${escaped.length} mutation(s) escaped`); process.exit(1); }
  console.log(`PASS driver safety edit immutability selftest (${mutations.length} mutations rejected)`); process.exit(0);
}
if (failures.length) { failures.forEach((failure) => console.error(`FAIL ${failure}`)); process.exit(1); }
console.log("PASS driver safety-event edit preserves void immutability and company-linked audit");
