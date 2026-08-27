#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/maintenance/pre-flight-dvir.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const route = candidate.slice(candidate.indexOf("/api/v1/maintenance/pre-flight-dvir/:defectId/route"));
  const lockAt = route.indexOf("const lockRes = await client.query");
  const readAt = route.indexOf("const defRes = await client.query");
  const woAt = route.indexOf("INSERT INTO maintenance.work_orders");
  const problems = [];
  if (lockAt < 0 || readAt < 0 || woAt < 0 || !(lockAt < readAt && readAt < woAt)) {
    problems.push("defect lock must precede routed-tag read and WO allocation");
  }
  if (!/SELECT id::text[\s\S]{0,180}FROM safety\.dvir_defects[\s\S]{0,180}id = \$1::uuid[\s\S]{0,120}operating_company_id = \$2::uuid[\s\S]{0,80}FOR UPDATE/.test(route)) {
    problems.push("lock must bind defect and operating company with FOR UPDATE");
  }
  if (!/if \(!lockRes\.rows\[0\]\) return \{ code: 404 as const, error: "defect_not_found" \}/.test(route)) {
    problems.push("missing locked defect must fail before routing");
  }
  if (!/pre-flight-dvir\/:defectId\/route"[\s\S]{0,180}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/.test(route)) {
    problems.push("authenticated routing endpoint must be rate limited");
  }
  if (!/const wo = woRes\.rows\[0\];\s*if \(!wo\?\.id\) throw new Error\("preflight_dvir_work_order_insert_failed"\)/.test(route)) {
    problems.push("major routing must fail before tag/audit when WO insert has no identity");
  }
  if (/wo\?\.id \?\? null/.test(route)) {
    problems.push("routed tag/audit must never accept a null WO identity");
  }
  return problems;
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-preflight-dvir-route-lock FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["FOR UPDATE", ""],
    ["AND operating_company_id = $2::uuid", "AND TRUE"],
    ['if (!lockRes.rows[0]) return { code: 404 as const, error: "defect_not_found" };', ""],
    ["const lockRes = await client.query", "const lockResMissing = await client.query"],
    ['if (!wo?.id) throw new Error("preflight_dvir_work_order_insert_failed");', ""],
    [
      '"/api/v1/maintenance/pre-flight-dvir/:defectId/route",\n    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },',
      '"/api/v1/maintenance/pre-flight-dvir/:defectId/route",',
    ],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-preflight-dvir-route-lock selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-preflight-dvir-route-lock --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-preflight-dvir-route-lock PASS — defect routing serializes before tag read and WO allocation");
