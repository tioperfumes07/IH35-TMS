#!/usr/bin/env node
import fs from "node:fs";

const FILE = "apps/backend/src/safety/hos.routes.ts";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const checks = [
    ["creator limiter", /hos\/exceptions"[\s\S]{0,180}rateLimit:\s*\{\s*max:\s*60,\s*timeWindow:\s*"1 minute"/],
    ["company driver", /FROM mdata\.drivers[\s\S]{0,160}operating_company_id = \$1::uuid[\s\S]{0,100}id = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/],
    ["driver failure", /if \(!driver\.rows\[0\]\?\.id\) return \{ kind: "driver_not_found" as const \}/],
    ["insert identity", /const exception = res\.rows\[0\][\s\S]{0,100}if \(!exception\?\.id\) throw new Error\("safety_hos_exception_insert_failed"\)/],
    ["audit lineage", /"safety\.hos\.exception_logged"[\s\S]{0,180}resource_id: exception\.id[\s\S]{0,100}driver_id: body\.data\.driver_id/],
    ["proven response", /kind: "ok" as const, exception[\s\S]{0,260}send\(created\.exception\)/],
  ];
  return checks.filter(([, pattern]) => !pattern.test(candidate)).map(([label]) => label);
}

const problems = failures(source);
if (problems.length) {
  console.error(`verify-safety-hos-exception-create-truth FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ['{ config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },', ""],
    ["            AND deactivated_at IS NULL\n", ""],
    ['if (!driver.rows[0]?.id) return { kind: "driver_not_found" as const };', ""],
    ['if (!exception?.id) throw new Error("safety_hos_exception_insert_failed");', ""],
    ["resource_id: exception.id", "resource_id: null"],
    ["send(created.exception)", "send(undefined)"],
  ];
  for (const [from, to] of mutations) {
    const changed = source.replace(from, to);
    if (changed === source || failures(changed).length === 0) {
      console.error(`verify-safety-hos-exception-create-truth selftest mutation escaped: ${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-safety-hos-exception-create-truth --selftest PASS (${mutations.length}/${mutations.length} planted defects red)`);
  process.exit(0);
}

console.log("verify-safety-hos-exception-create-truth PASS — company driver and persisted exception gate audit/201");
