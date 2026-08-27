#!/usr/bin/env node
import fs from "node:fs";

const routePath = new URL("../apps/backend/src/mdata/workflow-routes.ts", import.meta.url);
const source = fs.readFileSync(routePath, "utf8");

function verify(text) {
  const failures = [];
  if (!/async function callerCanTargetResource[^]*?WHERE r\.id = \$1::uuid[^]*?LIMIT 1\s+FOR UPDATE OF r/m.test(text)) failures.push("decision-time target authorization must lock the driver/unit/equipment row");
  const approve = text.slice(text.indexOf('app.post("/api/v1/mdata/workflow-requests/:id/approve"'), text.indexOf('app.post("/api/v1/mdata/workflow-requests/:id/reject"'));
  const countedWrites = approve.match(/targetUpdated = \(await client\.query\(/g) ?? [];
  if (countedWrites.length !== 5) failures.push("all five workflow target mutations must capture their affected-row count");
  if (!/if \(targetUpdated !== 1\) return \{ error: "mdata_workflow_request_not_found" as const \};\s+const updatedRes/m.test(approve)) failures.push("workflow must not become Approved unless exactly one target row changed");
  return failures;
}

const failures = verify(source);
if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("FOR UPDATE OF r", ""),
    source.replace("targetUpdated = (await client.query(", "await client.query("),
    source.replace("if (targetUpdated !== 1)", "if (false)"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) {
    console.error(`FAIL mdata workflow target fulfillment selftest: ${escaped.length} mutation(s) escaped`);
    process.exit(1);
  }
  console.log(`PASS mdata workflow target fulfillment selftest (${mutations.length} mutations rejected)`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL ${failure}`));
  process.exit(1);
}
console.log("PASS mdata workflow approval locks and proves its driver/unit/equipment fulfillment");
