#!/usr/bin/env node
/**
 * @matrix-built {"modules":["safety"],"cols":["driver","connectivity","qbo_chrome"],"leaves":["safety.panel.test_scheduling"],"task":"CLASS-F6539-DA-TEST-SCHEDULER-COMPANY-LIFECYCLE","vertical":"class-sweep"}
 * FMCSA Part 382 scheduling drafts, requests, success state and delayed timers
 * must belong to the exact selected company.
 */
import fs from "node:fs";
import process from "node:process";

const FILE = "apps/frontend/src/pages/safety/drug-alcohol/TestSchedulingPanel.tsx";

function inspect(source) {
  const errors = [];
  if (!source.includes("lifecycleGenerationRef") || !source.includes("successTimerRef")) errors.push("lifecycle generation/timer refs missing");
  if (!/useEffect\(\(\) => \{[\s\S]*mutation\.reset\(\)[\s\S]*clearTimeout\(successTimerRef\.current\)[\s\S]*setDriverUuid\(""\)[\s\S]*setTestType\("random"\)[\s\S]*setTestKind\("drug"\)[\s\S]*setScheduledAt\(""\)[\s\S]*\}, \[companyId\]\)/.test(source)) {
    errors.push("company transition does not reset complete scheduler draft/mutation/timer");
  }
  if (!/mutationFn: \(input:[\s\S]*postScheduleTest\(input\.companyId, input\.payload\)/.test(source)) errors.push("request does not snapshot company and payload");
  if (!source.includes("input.generation !== lifecycleGenerationRef.current")) errors.push("stale success can mutate new company UI");
  const timerClears = source.match(/clearTimeout\(successTimerRef\.current\)/g)?.length ?? 0;
  if (!source.includes("input.generation === lifecycleGenerationRef.current") || timerClears !== 3) errors.push("delayed success message is not lifecycle guarded at reschedule/transition/cleanup");
  if (!/mutation\.mutate\(\{[\s\S]*companyId,[\s\S]*generation: lifecycleGenerationRef\.current,[\s\S]*driver_uuid: driverUuid,[\s\S]*test_type: testType,[\s\S]*test_kind: testKind/.test(source)) {
    errors.push("submit does not carry complete immutable company/draft snapshot");
  }
  if (!source.includes('<EntityPicker') || !source.includes('kind="driver"')) errors.push("canonical driver picker removed");
  return errors;
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(FILE, "utf8");
  const mutations = [
    source.replace("mutation.reset();", "// planted: mutation reset removed"),
    source.replace("postScheduleTest(input.companyId, input.payload)", "postScheduleTest(companyId, input.payload)"),
    source.replace("input.generation !== lifecycleGenerationRef.current", "false"),
    source.replace("clearTimeout(successTimerRef.current);", "// planted: timer survives"),
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-da-test-scheduler-company-lifecycle SELFTEST FAIL — ${missed.length}/4 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-da-test-scheduler-company-lifecycle selftest PASS — 4/4 planted defects rejected");
  process.exit(0);
}

const errors = inspect(fs.readFileSync(FILE, "utf8"));
if (errors.length) {
  console.error("verify-da-test-scheduler-company-lifecycle FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-da-test-scheduler-company-lifecycle PASS — Part 382 scheduling is company-local");
