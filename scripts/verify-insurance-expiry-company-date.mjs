#!/usr/bin/env node
import fs from "node:fs";

const paths = [
  "apps/frontend/src/pages/insurance/PoliciesList.tsx",
  "apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx",
];
const sources = paths.map((file) => fs.readFileSync(file, "utf8"));
function findings(values) {
  const failures = [];
  values.forEach((source, index) => {
    if (!/companyToday\(\)/.test(source)) failures.push(`${paths[index]} does not use companyToday`);
    if (/Date\.UTC\(now\.getUTCFullYear\(\), now\.getUTCMonth\(\), now\.getUTCDate\(\)\)/.test(source)) failures.push(`${paths[index]} retains UTC-day expiry basis`);
    // BANK-F91278 leftover refuse — CoverageGapDashboard page-scoped only
    if (paths[index].includes("CoverageGapDashboard")) {
      if (source.includes("text-[11px]")) failures.push(`${paths[index]}: leftover text-[11px]`);
      if (source.includes("#8A92AB") || source.includes("#334155")) failures.push(`${paths[index]}: leftover off-scale muted`);
    }
  });
  return failures;
}
const failures = findings(sources);
if (process.argv.includes("--selftest")) {
  if (failures.length) throw new Error(`baseline failed: ${failures.join("; ")}`);
  const mutations = sources.map((source, index) => sources.map((value, candidate) => candidate === index ? value.replace("companyToday()", 'new Date().toISOString().slice(0, 10)') : value));
  mutations.forEach((mutation, index) => {
    if (findings(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  });
  const gapIdx = paths.findIndex((p) => p.includes("CoverageGapDashboard"));
  const leftoverPlant = sources.map((value, i) =>
    i === gapIdx ? `${value}\n<div className="text-[11px] text-[#8A92AB]">plant</div>` : value,
  );
  const leftoverHits = findings(leftoverPlant);
  if (!leftoverHits.some((e) => e.includes("leftover text-[11px]")) || !leftoverHits.some((e) => e.includes("leftover off-scale muted"))) {
    throw new Error(`leftover plant escaped: ${leftoverHits.join("; ")}`);
  }
  console.log(`verify-insurance-expiry-company-date SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red + leftover plant`);
  process.exit(0);
}
if (failures.length) {
  failures.forEach((failure) => console.error(`FAIL: ${failure}`));
  process.exit(1);
}
console.log("verify-insurance-expiry-company-date PASS");
