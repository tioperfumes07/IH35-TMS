#!/usr/bin/env node
import fs from "node:fs";

const source = fs.readFileSync("apps/frontend/src/pages/safety/tabs/GeofenceBreachesTab.tsx", "utf8");

function inspect(value) {
  const failures = [];
  const checks = [
    [/companyGenerationRef = useRef\(0\)/, "missing generation"],
    [/acknowledgeBreach\(input\.breachId, input\.companyId\)/, "ack request is not snapshotted"],
    [/input\.generation !== companyGenerationRef\.current/, "stale success is not rejected"],
    [/queryKey: \["safety", "geofence-breaches", input\.companyId\]/, "wrong company cache can refresh"],
    [/companyGenerationRef\.current \+= 1[\s\S]*acknowledgeMutation\.reset\(\)[\s\S]*setFilter\("active"\)/, "company switch does not reset workflow"],
    [/acknowledgeMutation\.variables\?\.generation === companyGenerationRef\.current/, "stale errors can leak"],
    [/kind="unit" id=\{event\.vehicle_id\}/, "unit reverse link missing"],
    [/kind="customer" id=\{event\.customer_id\}/, "customer reverse link missing"],
    [/kind="geofence" id=\{event\.geofence_id\}/, "geofence reverse link missing"],
  ];
  for (const [pattern, message] of checks) if (!pattern.test(value)) failures.push(message);
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    "companyGenerationRef = useRef(0)",
    "acknowledgeBreach(input.breachId, input.companyId)",
    "input.generation !== companyGenerationRef.current",
    'queryKey: ["safety", "geofence-breaches", input.companyId]',
    "acknowledgeMutation.variables?.generation === companyGenerationRef.current",
  ];
  for (const token of mutations) {
    if (!source.includes(token)) throw new Error(`fixture missing ${token}`);
    if (inspect(source.split(token).join("REMOVED_BY_SELFTEST")).length === 0) throw new Error(`missed ${token}`);
  }
  console.log(`verify-geofence-ack-company-lifecycle --selftest PASS (${mutations.length}/${mutations.length})`);
} else {
  const failures = inspect(source);
  if (failures.length) {
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-geofence-ack-company-lifecycle PASS — acknowledgement is company-stable and reverse-linked");
}
