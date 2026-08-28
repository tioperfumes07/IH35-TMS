#!/usr/bin/env node
import fs from "node:fs";

const paths = {
  detail: "apps/frontend/src/pages/DriverDetail.tsx",
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  layover: "apps/frontend/src/pages/drivers/DriverLayoverHistory.tsx",
  terminate: "apps/frontend/src/components/drivers/TerminateConfirmModal.tsx",
};

const source = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function findings(s) {
  const failures = [];
  const qualificationMatches = s.detail.match(/qualified_at:\s*companyToday\(\)/g) ?? [];
  if (qualificationMatches.length < 2) failures.push("DriverDetail qualification create/reset must use companyToday");
  if (!/max=\{companyToday\(\)\}/.test(s.detail)) failures.push("DriverDetail safety event max must use companyToday");
  if (!/const to = companyToday\(\);[\s\S]{0,80}const from = addDaysIso\(to, -30\);/.test(s.profile)) failures.push("DriverProfile layover summary must use the company calendar");
  if (!/useState\(\(\) => addDaysIso\(companyToday\(\), -30\)\)/.test(s.layover)) failures.push("DriverLayoverHistory from must use the company calendar");
  if (!/useState\(\(\) => companyToday\(\)\)/.test(s.layover)) failures.push("DriverLayoverHistory to must use the company calendar");
  if (/function todayIso\(\)[\s\S]{0,80}toISOString/.test(s.terminate)) failures.push("TerminateConfirmModal must not retain a shadow UTC-today helper");
  return failures;
}

const failures = findings(source);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = [
    { ...source, detail: source.detail.replace("qualified_at: companyToday()", 'qualified_at: new Date().toISOString().slice(0, 10)') },
    { ...source, detail: source.detail.replace("max={companyToday()}", 'max={new Date().toISOString().slice(0, 10)}') },
    { ...source, profile: source.profile.replace("const to = companyToday();", "const to = new Date().toISOString().slice(0, 10);") },
    { ...source, layover: source.layover.replace("addDaysIso(companyToday(), -30)", "new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)") },
    { ...source, layover: source.layover.replace("useState(() => companyToday())", "useState(() => new Date().toISOString().slice(0, 10))") },
    { ...source, terminate: `${source.terminate}\nfunction todayIso() { return new Date().toISOString().slice(0, 10); }\n` },
  ];
  mutations.forEach((mutated, index) => {
    if (findings(mutated).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  console.log(`verify-driver-nonmoney-business-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}

if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-driver-nonmoney-business-date PASS");
