#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/actionGenerationRef = useRef\(0\)/, "missing action generation"],
    [/ackAnomaly\(input\.anomalyId, input\.companyId\)/, "ack uses mutable identity"],
    [/resolveAnomaly\(input\.anomalyId, input\.companyId, input\.note\)/, "resolve uses mutable identity/note"],
    [/dismissAnomaly\(input\.anomalyId, input\.companyId, input\.note\)/, "dismiss uses mutable identity/note"],
    [/input\.generation !== actionGenerationRef\.current/g, "stale successes are not rejected"],
    [/actionGenerationRef\.current \+= 1[\s\S]*resetAckMutation\(\)[\s\S]*resetResolveMutation\(\)[\s\S]*resetDismissMutation\(\)/, "drawer reset does not cancel stale actions"],
    [/ackMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale ack error can leak"],
    [/resolveMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale resolve error can leak"],
    [/dismissMutation\.variables\?\.generation === actionGenerationRef\.current/, "stale dismiss error can leak"],
    [/<EntityLink[\s\S]*kind=\{anomaly\.subject_type\}[\s\S]*id=\{anomaly\.subject_id\}/, "subject reverse drill is missing"],
  ];
  for (const [pattern, message] of checks) {
    const matches = value.match(pattern);
    if (!matches || (message === "stale successes are not rejected" && matches.length < 3)) failures.push(message);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "actionGenerationRef = useRef(0)",
    "ackAnomaly(input.anomalyId, input.companyId)",
    "resolveAnomaly(input.anomalyId, input.companyId, input.note)",
    "dismissAnomaly(input.anomalyId, input.companyId, input.note)",
    "actionGenerationRef.current += 1",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-anomaly-detail-action-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-anomaly-detail-action-company-lifecycle PASS — actions are company/anomaly stable with subject linkage");
}
