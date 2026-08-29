#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/maintenance/arriving-soon.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const route = candidate.slice(candidate.indexOf("/api/v1/maintenance/arriving-soon/:load_id/convert-issue-to-wo"));
  const lineageCompanyCasCount = (route.match(/UPDATE dispatch\.intransit_issues[\s\S]{0,260}operating_company_id = \$3::uuid[\s\S]{0,100}promoted_to_wo_id IS NULL[\s\S]{0,100}promoted_to_damage_report_id IS NULL[\s\S]{0,80}RETURNING id::text/g) ?? []).length;
  const lineageFailureCount = (route.match(/if \(!linked\.rows\[0\]\) throw new Error\("arriving_soon_issue_link_lost"\)/g) ?? []).length;
  const checks = [
    ["route limiter", /convert-issue-to-wo"[\s\S]{0,160}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["source company lock", /FROM dispatch\.intransit_issues[\s\S]{0,240}operating_company_id = \$2::uuid[\s\S]{0,100}unit_id = \$3[\s\S]{0,180}FOR UPDATE/],
    ["source lock parameters", /\[body\.data\.issue_id, companyId, load\.unit_id\]/],
    ["WO insert failure truth", /if \(!wo\?\.id\) throw new Error\("arriving_soon_work_order_insert_failed"\)/],
    ["lineage company CAS (both schema branches)", lineageCompanyCasCount === 2],
    ["lineage failure truth (both schema branches)", lineageFailureCount === 2],
    ["unit block load/company scope", /UPDATE mdata\.units AS u[\s\S]{0,500}COALESCE\(u\.currently_leased_to_company_id, u\.owner_company_id\) = \$4::uuid[\s\S]{0,180}l\.id = \$3::uuid[\s\S]{0,100}l\.operating_company_id = \$4::uuid[\s\S]{0,100}l\.assigned_unit_id = u\.id[\s\S]{0,160}RETURNING id::text/],
    ["unit block failure truth", /if \(!blocked\.rows\[0\]\) throw new Error\("arriving_soon_unit_block_lost"\)/],
  ];
  return checks.filter(([, assertion]) => typeof assertion === "boolean" ? !assertion : !assertion.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-arriving-soon-convert-atomic FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  if (problems.length) {
    console.error(`verify-arriving-soon-convert-atomic selftest BASELINE FAIL:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
    process.exit(1);
  }
  const mutations = [
    ['"/api/v1/maintenance/arriving-soon/:load_id/convert-issue-to-wo",\n    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', '"/api/v1/maintenance/arriving-soon/:load_id/convert-issue-to-wo",'],
    ["AND operating_company_id = $2::uuid\n            AND unit_id = $3", "AND TRUE\n            AND unit_id = $3"],
    ["FOR UPDATE", ""],
    ['if (!wo?.id) throw new Error("arriving_soon_work_order_insert_failed");', ""],
    ["AND operating_company_id = $3::uuid", "AND TRUE", true],
    ['if (!linked.rows[0]) throw new Error("arriving_soon_issue_link_lost");', "", true],
    ["AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $4::uuid", "AND TRUE"],
    ["AND l.operating_company_id = $4::uuid", "AND TRUE"],
    ['if (!blocked.rows[0]) throw new Error("arriving_soon_unit_block_lost");', ""],
  ];
  for (const [from, to, replaceAll = false] of mutations) {
    const changed = replaceAll ? source.replaceAll(from, to) : source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-arriving-soon-convert-atomic selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-arriving-soon-convert-atomic --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-arriving-soon-convert-atomic PASS — issue conversion is scoped, locked, CAS-linked, and unit-safe");
