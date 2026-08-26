#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","connectivity"],"leaves":["leave_requests.detail"],"task":"CLASS-F6537-DRIVER-SCHEDULER-REVIEW-RECORD-LIFECYCLE","vertical":"class-sweep"}
 * Approve/deny actions must belong to the exact request and operating company;
 * denial drafts and stale callbacks may not cross route/company transitions.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerRequestDetailPage.tsx";

function inspect(source) {
  const errors = [];
  if (!/useEffect\(\(\) => \{[\s\S]*approveMut\.reset\(\)[\s\S]*denyMut\.reset\(\)[\s\S]*setDeniedReason\(""\)[\s\S]*setError\(""\)[\s\S]*\}, \[id, operatingCompanyId\]\)/.test(source)) {
    errors.push("request/company transition does not reset review draft, error and mutations");
  }
  if (!/mutationFn: \(input: \{ operatingCompanyId: string; requestId: string; generation: number \}\)[\s\S]*reviewRequest\(input\.operatingCompanyId, input\.requestId/.test(source)) {
    errors.push("approve does not snapshot company and request");
  }
  if (!/mutationFn: \(input: \{ operatingCompanyId: string; requestId: string; reason: string; generation: number \}\)[\s\S]*denied_reason: input\.reason/.test(source)) {
    errors.push("deny does not snapshot company, request and reason");
  }
  const generationGuards = source.match(/input\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (generationGuards !== 4) errors.push("approve/deny success and error are not all stale-context guarded");
  const actionSnapshots = source.match(/operatingCompanyId,[\s\S]{0,120}requestId: id,[\s\S]{0,160}generation: lifecycleGenerationRef\.current/g)?.length ?? 0;
  if (actionSnapshots !== 2) errors.push("approve and deny UI actions do not carry exact context generation");
  if (!source.includes('queryKey: ["driver-scheduler", "request", input.requestId, input.operatingCompanyId]')) errors.push("detail refresh is not exact-context scoped");
  if (!source.includes('<EntityLinkOrTombstone kind="driver"')) errors.push("driver forward drill was removed");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("approveMut.reset();", "// planted: approve reset removed"),
    source.replace("denied_reason: input.reason", "denied_reason: deniedReason"),
    source.replaceAll("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("[id, operatingCompanyId]", "[id]"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-driver-scheduler-review-record-lifecycle SELFTEST FAIL — ${missed.length}/4 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-driver-scheduler-review-record-lifecycle selftest PASS — 4/4 planted defects rejected");
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-driver-scheduler-review-record-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-driver-scheduler-review-record-lifecycle PASS — approve/deny actions are request- and company-local");
