#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/safety/drug-program.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const checks = [
    ["shared company driver", /function hasActiveDriverInCompany[\s\S]{0,700}FROM mdata\.drivers d[\s\S]{0,180}d\.deactivated_at IS NULL[\s\S]{0,260}d\.operating_company_id = \$1::uuid[\s\S]{0,380}drug_program_write_dca\.is_authorized = true[\s\S]{0,180}deactivated_at IS NULL/],
    ["three write rate limits", (candidate.match(/app\.post\("\/api\/v1\/safety\/drug-program\/(?:tests|random-pools|clearinghouse-queries)", \{ config: \{ rateLimit: \{ max: 60, timeWindow: "1 minute" \} \} \}/g) ?? []).length === 3],
    ["three driver gates", (candidate.match(/await hasActiveDriverInCompany\(client, company\.data\.operating_company_id, body\.data\.driver_id\)/g) ?? []).length === 3],
    ["test identity", /const test = res\.rows\[0\][\s\S]{0,100}safety_drug_test_insert_failed[\s\S]{0,220}resource_id: test\.id/],
    ["pool identity", /const selection = res\.rows\[0\][\s\S]{0,100}safety_random_pool_insert_failed[\s\S]{0,220}resource_id: selection\.id/],
    ["document company", /FROM docs\.files[\s\S]{0,180}id = \$2::uuid[\s\S]{0,100}operating_company_id = \$1::uuid[\s\S]{0,100}deleted_at IS NULL/],
    ["clearinghouse identity", /const clearinghouseQuery = res\.rows\[0\][\s\S]{0,120}safety_clearinghouse_query_insert_failed[\s\S]{0,240}resource_id: clearinghouseQuery\.id/],
    ["three proven responses", (candidate.match(/reply\.code\(201\)\.send\(created\.row\)/g) ?? []).length === 3],
  ];
  return checks.filter(([, proof]) => typeof proof === "boolean" ? !proof : !proof.test(candidate)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-safety-drug-program-create-class FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["drug_program_write_dca.is_authorized = true", "TRUE"],
    ['app.post("/api/v1/safety/drug-program/tests", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }', 'app.post("/api/v1/safety/drug-program/tests", {}'],
    ["await hasActiveDriverInCompany(client, company.data.operating_company_id, body.data.driver_id)", "true"],
    ['if (!test?.id) throw new Error("safety_drug_test_insert_failed");', ""],
    ['if (!selection?.id) throw new Error("safety_random_pool_insert_failed");', ""],
    ["              AND deleted_at IS NULL\n", ""],
    ['if (!clearinghouseQuery?.id) throw new Error("safety_clearinghouse_query_insert_failed");', ""],
    ["resource_id: clearinghouseQuery.id", "resource_id: null"],
    ["reply.code(201).send(created.row)", "reply.code(201).send(undefined)"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-safety-drug-program-create-class selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-safety-drug-program-create-class --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-safety-drug-program-create-class PASS — all three mounted creators prove company driver, canonical row, audit, and response");
