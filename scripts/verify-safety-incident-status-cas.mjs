#!/usr/bin/env node
import fs from "node:fs";

const routePath = new URL("../apps/backend/src/safety/incidents.routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");

function verify(text) {
  const failures = [];
  const route = text.slice(text.indexOf('app.post("/api/v1/safety/incidents/:id/status"'), text.indexOf('app.post("/api/v1/safety/incidents/:id/void"'));
  if (!/WHERE id = \$1 AND operating_company_id = \$2::uuid\s+AND voided_at IS NULL\s+AND status = \$5/m.test(route)) failures.push("incident status UPDATE must compare active state and validated source status");
  if (!/body\.data\.status,[^]*?row\.status,\s*\][^]*?if \(!updatedRow\) return \{ kind: "conflict_race" as const \};\s*await appendCrudAudit/m.test(route)) failures.push("lost status transition must stop before audit");
  if (!/outcome\.kind === "conflict_race"[^]*?reply\.code\(409\)[^]*?incident_state_changed/m.test(route)) failures.push("concurrent incident transition must return explicit HTTP 409");
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("AND voided_at IS NULL\n            AND status = $5", "AND true"),
    source.replace("row.status,\n        ]", "]"),
    source.replace('if (!updatedRow) return { kind: "conflict_race" as const };', 'if (!updatedRow) return { kind: "not_found" as const };'),
    source.replace('if (outcome.kind === "conflict_race")', 'if (outcome.kind === "other_race")'),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) {
    console.error(`FAIL safety incident status CAS selftest: ${escaped.length} mutation(s) escaped`);
    process.exit(1);
  }
  console.log(`PASS safety incident status CAS selftest (${mutations.length} mutations rejected)`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}
console.log("PASS safety incident status is an active source-state CAS with honest conflict");
