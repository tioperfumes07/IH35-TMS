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
  // BANK-F91247 leftover refuse — RandomPoolDashboard only
  if (value.includes("text-[11px]")) failures.push("leftover text-[11px]");
  if (value.includes("#8A92AB") || value.includes("#334155")) failures.push("leftover off-scale muted");
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
  // BANK-F91247 leftover plant
  const leftoverPlant = `${source}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`;
  const leftover = inspect(leftoverPlant);
  if (!leftover.includes("leftover text-[11px]") || !leftover.includes("leftover off-scale muted")) {
    throw new Error(`leftover plant escaped: ${leftover.join("; ")}`);
  }
  console.log(`verify-random-pool-driver-reverse-lifecycle --selftest PASS (${mutations.length}/${mutations.length} + leftover plant rejected)`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-random-pool-driver-reverse-lifecycle PASS — draws are company-stable and driver-drillable");
}
