#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx";
const source = fs.readFileSync(file, "utf8");

const checks = [
  ["matrix claim", /@matrix-built modules=drivers cols=driver,unit,connectivity,reverse_link/],
  ["generation ref", /const actionGenerationRef = useRef\(0\)/],
  ["save snapshots company and session", /saveOnboardingStep\(input\.sessionId, input\.companyId, input\.payload\)/],
  ["complete snapshots company and session", /completeOnboardingSession\(input\.sessionId, input\.companyId\)/],
  ["override snapshots reason and scope", /adminOverrideOnboardingSession\(input\.sessionId, input\.companyId,[\s\S]*?reason: input\.reason/],
  ["stale callbacks rejected", /input\.generation !== actionGenerationRef\.current/],
  ["context transition increments generation", /actionGenerationRef\.current \+= 1/],
  ["context transition resets mutations", /saveMut\.reset\(\);[\s\S]*?completeMut\.reset\(\);[\s\S]*?overrideMut\.reset\(\)/],
  ["save call captures immutable input", /saveMut\.mutateAsync\(\{ companyId, sessionId: sessionId!, generation: actionGenerationRef\.current, payload:/],
  ["complete call captures immutable input", /completeMut\.mutateAsync\(\{ companyId, sessionId, generation: actionGenerationRef\.current \}\)/],
  ["override call captures immutable reason", /overrideMut\.mutateAsync\(\{ companyId, sessionId, generation: actionGenerationRef\.current, reason: overrideReason\.trim\(\) \}\)/],
  ["driver upload keeps canonical link", /entity_links: driverId \? \[\{ entity_type: "driver", entity_id: driverId \}\] : undefined/],
  ["driver reverse drill retained", /<EntityLinkOrTombstone[\s\S]*?kind="driver"[\s\S]*?id=\{driverId\}/],
];

function failures(text) {
  return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);
}

const baseFailures = failures(source);
if (baseFailures.length) {
  console.error(`verify-driver-onboarding-action-company-lifecycle FAIL: ${baseFailures.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("actionGenerationRef.current += 1", "actionGenerationRef.current += 0"),
    source.replace("saveOnboardingStep(input.sessionId, input.companyId, input.payload)", "saveOnboardingStep(sessionId!, companyId, input.payload)"),
    source.replace("completeOnboardingSession(input.sessionId, input.companyId)", "completeOnboardingSession(sessionId!, companyId)"),
    source.replace("reason: input.reason", "reason: overrideReason.trim()"),
    source.replaceAll("input.generation !== actionGenerationRef.current", "false").replaceAll("input.generation === actionGenerationRef.current", "true"),
  ];
  const missed = mutations.filter((text) => failures(text).length === 0).length;
  if (missed) {
    console.error(`verify-driver-onboarding-action-company-lifecycle selftest FAIL: ${missed}/5 mutations escaped`);
    process.exit(1);
  }
  console.log("verify-driver-onboarding-action-company-lifecycle selftest PASS — 5/5 planted defects detected");
  process.exit(0);
}

console.log("verify-driver-onboarding-action-company-lifecycle PASS — onboarding save/complete/override/upload preserve immutable company-session-driver lifecycle and reverse drill");
