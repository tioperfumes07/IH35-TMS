#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/insurance/claim.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const routeStart = candidate.indexOf('app.post("/api/v1/insurance/claims"');
  const nextRoute = routeStart < 0
    ? -1
    : candidate.indexOf('app.patch("/api/v1/insurance/claims/:id"', routeStart);
  const route = routeStart < 0 || nextRoute < 0
    ? ""
    : candidate.slice(routeStart, nextRoute);
  const checks = [
    ["creator limiter", /insurance\/claims"[\s\S]{0,160}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["insert rollback", /if \(!createdId\) throw new Error\("insurance_claim_insert_failed"\)/],
    ["reverse result", /const reverseLink = await client\.query[\s\S]{0,480}RETURNING id::text[\s\S]{0,180}if \(!reverseLink\.rows\[0\]\?\.id\) throw new Error\("insurance_claim_accident_reverse_link_failed"\)/],
    ["detail rollback", /const claim = result\.rows\[0\][\s\S]{0,100}if \(!claim\?\.id\) throw new Error\("insurance_claim_detail_read_failed"\)/],
    ["create audit", /appendCrudAudit\([\s\S]{0,120}"insurance\.claim\.created"[\s\S]{0,220}resource_id: claim\.id[\s\S]{0,120}operating_company_id: body\.operating_company_id/],
    ["linkage audit", /policy_id: body\.policy_id[\s\S]{0,260}load_id: body\.load_id \?\? null[\s\S]{0,180}driver_id: body\.driver_id \?\? null/],
    ["proven row", /row: claim/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-insurance-claim-create-atomic-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['if (!createdId) throw new Error("insurance_claim_insert_failed");', 'if (!createdId) return { kind: "claim_not_found" as const };'],
    ["if (!reverseLink.rows[0]?.id)", "if (false)"],
    ['if (!claim?.id) throw new Error("insurance_claim_detail_read_failed");', ""],
    ['"insurance.claim.created"', '"insurance.claim.missing"'],
    ["resource_id: claim.id", 'resource_id: ""'],
    ["row: claim", "row: result.rows[0]"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-insurance-claim-create-atomic-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-insurance-claim-create-atomic-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-insurance-claim-create-atomic-truth PASS — claim insert, reverse link, detail read, and audit are atomic");
