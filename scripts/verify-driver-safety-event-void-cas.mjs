#!/usr/bin/env node
import fs from "node:fs";
const routePath = new URL("../apps/backend/src/mdata/driver-safety-events.routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");
function verify(text) {
  const createMarker = 'app.post("/api/v1/mdata/drivers/:driver_id/safety-events"';
  const marker = 'app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id/void"';
  const createStart = text.indexOf(createMarker);
  const endMarker = 'app.patch("/api/v1/mdata/drivers/:driver_id/safety-events/:event_id",';
  const start = text.indexOf(marker); const end = text.indexOf(endMarker, start);
  const createBlock = createStart >= 0 && start > createStart ? text.slice(createStart, start) : "";
  const block = start >= 0 && end > start ? text.slice(start, end) : "";
  const failures = [];
  if (!/UPDATE mdata\.drivers[\s\S]*?WHERE id = \$1\s*AND operating_company_id = \$4::uuid\s*RETURNING id::text/m.test(createBlock)) failures.push("termination must update the exact company-scoped driver and return its identity");
  if (!/if \(driverUpdateRes\.rows\[0\]\?\.id !== parsedParams\.data\.driver_id\) \{\s*throw new Error\("driver_termination_status_write_failed"\);\s*\}[\s\S]*?await appendCrudAudit/m.test(createBlock)) failures.push("lost termination driver write must abort before audit/success");
  if (!/WHERE id = \$1 AND driver_id = \$2 AND voided_at IS NULL\s*RETURNING \*/m.test(block)) failures.push("driver safety-event void must be active-state CAS");
  if (!/const row = updateRes\.rows\[0\];\s*if \(!row\) return \{ error: "already_voided" as const \};\s*await appendCrudAudit/m.test(block)) failures.push("lost void CAS must fail before audit");
  if (!/driver_id: row\.driver_id,\s*operating_company_id: opco,\s*void_reason:/m.test(block)) failures.push("void audit must carry resolved operating company");
  return failures;
}
const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("AND operating_company_id = $4::uuid\n            RETURNING id::text", "RETURNING id::text"),
    source.replace('throw new Error("driver_termination_status_write_failed");', 'return row;'),
    source.replace("WHERE id = $1 AND driver_id = $2 AND voided_at IS NULL", "WHERE id = $1 AND driver_id = $2"),
    source.replace('if (!row) return { error: "already_voided" as const };', 'if (false) return { error: "already_voided" as const };'),
    source.replace("driver_id: row.driver_id,\n          operating_company_id: opco,", "driver_id: row.driver_id,"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) { console.error(`FAIL driver safety void CAS selftest: ${escaped.length} mutation(s) escaped`); process.exit(1); }
  console.log(`PASS driver safety void CAS selftest (${mutations.length} mutations rejected)`); process.exit(0);
}
if (failures.length) { failures.forEach((failure) => console.error(`FAIL ${failure}`)); process.exit(1); }
console.log("PASS driver safety-event create/void lifecycle requires company-linked canonical writes before audit");
