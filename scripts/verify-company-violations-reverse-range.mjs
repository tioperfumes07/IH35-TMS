#!/usr/bin/env node
import fs from "node:fs";
const file = "apps/frontend/src/components/safety/SafetyAlertsReverseSection.tsx";
let source = fs.readFileSync(file, "utf8");
const checks = [
  ["range request", () => /offset: \(violationPage - 1\) \* violationPageSize/.test(source)],
  ["query key owns page", () => /"company-violations", operatingCompanyId, subjectKind, subjectId, violationPage/.test(source)],
  ["exact total", () => /violationTotal = failed \? 0 : \(companyViolationQ\.data\?\.total_count \?\? 0\)/.test(source)],
  ["scope reset", () => /setViolationPage\(1\)[\s\S]*\[operatingCompanyId, subjectKind, subjectId\]/.test(source)],
  ["driver/unit only", () => /subjectKind === "driver" \|\| subjectKind === "unit"/.test(source)],
  ["reverse pager", () => /safety-violations-reverse-pager-\$\{subjectKind\}/.test(source)],
  ["honest range label", () => /\{violationTotal\} violations/.test(source)],
];
const failures = () => checks.filter(([, fn]) => !fn()).map(([name]) => name);
if (failures().length) { console.error(`FAIL verify-company-violations-reverse-range: ${failures().join("; ")}`); process.exit(1); }
if (process.argv.includes("--selftest")) {
  const original = source;
  const mutations = [
    ["offset: (violationPage - 1) * violationPageSize", "offset: 0"],
    ["subjectId, violationPage", "subjectId"],
    ["companyViolationQ.data?.total_count ?? 0", "violations.length"],
    ["setViolationPage(1);", ""],
    ["subjectKind === \"driver\" || subjectKind === \"unit\"", "subjectKind === \"driver\""],
    ["safety-violations-reverse-pager-${subjectKind}", "safety-violations-summary-${subjectKind}"],
    ["{violationTotal} violations", "{violations.length} violations"],
  ];
  for (const [needle, replacement] of mutations) {
    source = original.replace(needle, replacement);
    if (!failures().length) { console.error(`FAIL selftest: mutation survived (${needle})`); process.exit(1); }
  }
  console.log(`PASS verify-company-violations-reverse-range --selftest (${mutations.length}/${mutations.length} mutations killed)`);
} else console.log(`PASS verify-company-violations-reverse-range (${checks.length}/${checks.length} checks)`);
