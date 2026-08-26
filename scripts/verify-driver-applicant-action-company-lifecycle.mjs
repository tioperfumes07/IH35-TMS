#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/pages/drivers/ApplicantsPipelinePage.tsx";
const source = fs.readFileSync(file, "utf8");
const checks = [
  ["leaf matrix claim", /@matrix-built modules=drivers cols=driver,connectivity,reverse_link/],
  ["action generation", /const actionGenerationRef = useRef\(0\)/],
  ["status company snapshot", /updateApplicantStatus\(input\.id, input\.companyId, \{ status: input\.status \}\)/],
  ["convert company snapshot", /convertApplicantToDriver\(input\.id, input\.companyId\)/],
  ["status exact invalidation", /statusM[\s\S]*?invalidateQueries\(\{ queryKey: \["driver-applicants", input\.companyId\] \}\)/],
  ["convert exact invalidation", /convertM[\s\S]*?invalidateQueries\(\{ queryKey: \["driver-applicants", input\.companyId\] \}\)/],
  ["stale callback rejection", /input\.generation === actionGenerationRef\.current/],
  ["company transition invalidates generation", /actionGenerationRef\.current \+= 1/],
  ["company transition resets both actions", /statusM\.reset\(\);[\s\S]*?convertM\.reset\(\)/],
  ["status caller snapshots context", /statusM\.mutate\(\{ id: row\.id, status, companyId: selectedCompanyId, generation: actionGenerationRef\.current \}\)/],
  ["convert caller snapshots context", /convertM\.mutate\(\{ id: row\.id, companyId: selectedCompanyId, generation: actionGenerationRef\.current \}\)/],
  ["converted driver reverse drill", /kind="driver" id=\{row\.converted_driver_id\}/],
  ["onboarding reverse drill", /kind="onboarding_session"[\s\S]*?id=\{row\.onboarding_session_id\}/],
];

function failures(text) {
  return checks.filter(([, pattern]) => !pattern.test(text)).map(([label]) => label);
}

const base = failures(source);
if (base.length) {
  console.error(`verify-driver-applicant-action-company-lifecycle FAIL: ${base.join(", ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("actionGenerationRef.current += 1", "actionGenerationRef.current += 0"),
    source.replace("updateApplicantStatus(input.id, input.companyId, { status: input.status })", "updateApplicantStatus(input.id, selectedCompanyId ?? '', { status: input.status })"),
    source.replace("convertApplicantToDriver(input.id, input.companyId)", "convertApplicantToDriver(input.id, selectedCompanyId ?? '')"),
    source.replaceAll('["driver-applicants", input.companyId]', '["driver-applicants", selectedCompanyId]'),
    source.replaceAll("input.generation === actionGenerationRef.current", "true"),
  ];
  const escaped = mutations.filter((text) => failures(text).length === 0).length;
  if (escaped) {
    console.error(`verify-driver-applicant-action-company-lifecycle selftest FAIL: ${escaped}/5 mutations escaped`);
    process.exit(1);
  }
  console.log("verify-driver-applicant-action-company-lifecycle selftest PASS — 5/5 planted defects detected");
  process.exit(0);
}

console.log("verify-driver-applicant-action-company-lifecycle PASS — status/convert preserve submitted company and reverse drills across transitions");
