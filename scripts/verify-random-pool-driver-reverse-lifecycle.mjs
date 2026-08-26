#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/drug-alcohol/RandomPoolDashboard.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing generation"],
    [/triggerDraw\(input\.companyId\)/, "draw request is not company-snapshotted"],
    [/input\.generation !== companyGenerationRef\.current/, "stale success is not rejected"],
    [/queryKey: \["safety", "da-program", "draws", input\.companyId\]/, "wrong draw cache can refresh"],
    [/companyGenerationRef\.current \+= 1[\s\S]*drawMutation\.reset\(\)/, "company transition does not reset draw"],
    [/drawMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale status can leak"],
    [/flatMap\(\(draw\) => draw\.drawn_driver_uuids\)/, "drawn driver ids are discarded"],
    [/useDriverLabels\(companyId, drawnDriverIds\)/, "driver labels are not company-scoped"],
    [/<EntityLink[\s\S]*kind="driver"[\s\S]*id=\{driverId\}/, "selected drivers lack reverse drill"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "triggerDraw(input.companyId)",
    "input.generation !== companyGenerationRef.current",
    'queryKey: ["safety", "da-program", "draws", input.companyId]',
    "useDriverLabels(companyId, drawnDriverIds)",
    'kind="driver"',
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-random-pool-driver-reverse-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-random-pool-driver-reverse-lifecycle PASS — draws are company-stable and driver-drillable");
}
