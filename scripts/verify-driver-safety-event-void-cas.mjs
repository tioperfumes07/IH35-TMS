#!/usr/bin/env node
import fs from "node:fs";
const routePath = new URL("../apps/backend/src/mdata/driver-safety-events.routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");
function verify(text) {
  const marker = 'app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id/void"';
  const endMarker = 'app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id",';
  const start = text.indexOf(marker); const end = text.indexOf(endMarker, start); const block = start >= 0 && end > start ? text.slice(start, end) : "";
  const failures = [];
  if (!/WHERE id = \$1 AND driver_id = \$2 AND voided_at IS NULL\s*RETURNING \*/m.test(block)) failures.push("driver safety-event void must be active-state CAS");
  if (!/const row = updateRes\.rows\[0\];\s*if \(!row\) return \{ error: "already_voided" as const \};\s*await appendCrudAudit/m.test(block)) failures.push("lost void CAS must fail before audit");
  if (!/driver_id: row\.driver_id,\s*operating_company_id: opco,\s*void_reason:/m.test(block)) failures.push("void audit must carry resolved operating company");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("WHERE id = $1 AND driver_id = $2 AND voided_at IS NULL", "WHERE id = $1 AND driver_id = $2"),
    source.replace('if (!row) return { error: "already_voided" as const };', 'if (false) return { error: "already_voided" as const };'),
    source.replace("driver_id: row.driver_id,\n          operating_company_id: opco,", "driver_id: row.driver_id,"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) { console.error(`FAIL driver safety void CAS selftest: ${escaped.length} mutation(s) escaped`); process.exit(1); }
  console.log(`PASS driver safety void CAS selftest (${mutations.length} mutations rejected)`); process.exit(0);
}
if (failures.length) { failures.forEach((failure) => console.error(`FAIL ${failure}`)); process.exit(1); }
console.log("PASS driver safety-event void is company-linked active-state CAS before audit");
