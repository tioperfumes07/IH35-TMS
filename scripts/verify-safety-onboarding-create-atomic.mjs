#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/safety/onboarding.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const route = candidate.slice(candidate.indexOf('/api/v1/safety/onboarding/sessions"'));
  const checks = [
    ["creator limiter", /onboarding\/sessions"[\s\S]{0,180}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["company driver lock", /FROM mdata\.drivers[\s\S]{0,180}operating_company_id = \$1::uuid[\s\S]{0,100}id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL[\s\S]{0,100}FOR UPDATE/],
    ["driver failure", /if \(!driver\.rows\[0\]\?\.id\) return \{ kind: "driver_not_found" as const \}/],
    ["resume after lock", /FOR UPDATE[\s\S]{0,500}FROM safety\.onboarding_sessions[\s\S]{0,180}status = 'in_progress'/],
    ["insert identity", /const session = res\.rows\[0\][\s\S]{0,100}if \(!session\?\.id\) throw new Error\("safety_onboarding_session_insert_failed"\)/],
    ["create audit", /"safety\.onboarding_session\.created"[\s\S]{0,180}resource_id: session\.id[\s\S]{0,120}operating_company_id: body\.data\.operating_company_id[\s\S]{0,100}driver_id: body\.data\.driver_id \?\? null/],
    ["proven response", /kind: "ok" as const, session, resumed: false as const/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(route)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-safety-onboarding-create-atomic FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', ""],
    ["              AND deactivated_at IS NULL\n", ""],
    ["            FOR UPDATE", ""],
    ['if (!driver.rows[0]?.id) return { kind: "driver_not_found" as const };', ""],
    ['if (!session?.id) throw new Error("safety_onboarding_session_insert_failed");', ""],
    ["resource_id: session.id", "resource_id: null"],
    ['kind: "ok" as const, session, resumed: false as const', 'session: res.rows[0], resumed: false as const'],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-safety-onboarding-create-atomic selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-safety-onboarding-create-atomic --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-safety-onboarding-create-atomic PASS — canonical company driver lock, resume, insert, and audit are one transaction");
